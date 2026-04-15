const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const vapidKeys = {
  publicKey: 'BOeK5brFMJlQFjbFpyvTjoKsDWGz63b-4Z_oD63dPyaP8GMY3QrPfGLKYocEurT9d-XwBeqka_tMV1j1yNnZcdQ',
  privateKey: '4fLyZylHpmIVy-ASa_FtHOyf4maQTs5ugI2pIffj0rc'
};

webpush.setVapidDetails(
  'mailto:max-demid0v@ya.ru',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

let subscriptions = [];
const reminders = new Map();
const sentReminders = new Map();

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('Клиент подключён:', socket.id);

  socket.on('newTask', (task) => {
    io.emit('taskAdded', task);
    
    const payload = JSON.stringify({
      title: 'Новая задача',
      body: task.text
    });

    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => {
        console.error('Push error:', err);
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      });
    });
  });

  socket.on('newReminder', (reminder) => {
    const { id, text, reminderTime } = reminder;
    const delay = reminderTime - Date.now();
    
    if (delay <= 0) return;

    console.log(`Планируем напоминание "${text}" через ${Math.round(delay/1000)}с`);

    const timeoutId = setTimeout(() => {
      const payload = JSON.stringify({
        title: '!!! Напоминание',
        body: text,
        reminderId: id
      });

      subscriptions.forEach(sub => {
        webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
      });

      sentReminders.set(id, { text, reminderTime });
      reminders.delete(id);
    }, delay);

    reminders.set(id, { timeoutId, text, reminderTime });
  });

  socket.on('cancelReminder', ({ id }) => {
    if (reminders.has(id)) {
      clearTimeout(reminders.get(id).timeoutId);
      reminders.delete(id);
    }
    sentReminders.delete(id);
  });

  socket.on('disconnect', () => {
    console.log('Клиент отключён:', socket.id);
  });
});

app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  if (!subscriptions.some(sub => sub.endpoint === subscription.endpoint)) {
    subscriptions.push(subscription);
  }
  console.log('Подписка сохранена. Всего:', subscriptions.length);
  res.status(201).json({ message: 'OK' });
});

app.post('/unsubscribe', (req, res) => {
  subscriptions = subscriptions.filter(sub => sub.endpoint !== req.body.endpoint);
  console.log('Подписка удалена. Осталось:', subscriptions.length);
  res.status(200).json({ message: 'OK' });
});

app.post('/snooze', (req, res) => {
  const reminderId = parseInt(req.query.reminderId, 10);
  
  let reminderText = null;
  const reminder = reminders.get(reminderId);
  
  if (reminder) {
    reminderText = reminder.text;
  } else if (sentReminders.has(reminderId)) {
    reminderText = sentReminders.get(reminderId).text;
  } else {
    return res.status(404).json({ error: 'Not found' });
  }
  
  if (reminder) clearTimeout(reminder.timeoutId);
  
  const snoozeDelay = 5 * 60 * 1000;
  
  const newTimeoutId = setTimeout(() => {
    const payload = JSON.stringify({
      title: 'Напоминание отложено',
      body: reminderText,
      reminderId: reminderId
    });

    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => console.error('Push error:', err));
    });

    reminders.delete(reminderId);
    sentReminders.delete(reminderId);
  }, snoozeDelay);

  reminders.set(reminderId, {
    timeoutId: newTimeoutId,
    text: reminderText,
    reminderTime: Date.now() + snoozeDelay
  });
  
  sentReminders.delete(reminderId);

  console.log(`Напоминание ${reminderId} отложено на 5 минут`);
  res.status(200).json({ message: 'OK' });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});