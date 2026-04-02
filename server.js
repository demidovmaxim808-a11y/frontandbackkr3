const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// ========== VAPID КЛЮЧИ ==========
// Сгенерируйте свои через: npx web-push generate-vapid-keys
// И вставьте сюда:
const vapidKeys = {
  publicKey: 'BDwHb4ILBEx7NLkfdYXO7l_cO2bptbpexLUYJkosOqMa13zHK1yG5UE-PgzSuNjOHjX3Eh0SGvgybUSrbb2H9FQ',
  privateKey: 'vDVGRxilaoHrYEH_Xz0wBPmCCzt6qqAu_L3-9vNm3z4'
};

webpush.setVapidDetails(
  'mailto:max-demid@yandex.ru', // замените на свой email
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Раздача статики
app.use(express.static(path.join(__dirname, './')));

// Хранилище push-подписок
let subscriptions = [];

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// WebSocket соединение
io.on('connection', (socket) => {
  console.log('✅ Клиент подключён:', socket.id);

  socket.on('newTask', (task) => {
    console.log('📝 Новая задача:', task.text);
    
    // Рассылаем всем клиентам через WebSocket
    io.emit('taskAdded', task);
    
    // Отправляем push-уведомления всем подписанным клиентам
    const payload = JSON.stringify({
      title: '📝 Новая задача',
      body: task.text
    });
    
    subscriptions.forEach(sub => {
      webpush.sendNotification(sub, payload).catch(err => {
        console.error('❌ Push ошибка:', err);
        // Если подписка невалидна - удаляем её
        if (err.statusCode === 410) {
          subscriptions = subscriptions.filter(s => s.endpoint !== sub.endpoint);
        }
      });
    });
  });

  socket.on('disconnect', () => {
    console.log('❌ Клиент отключён:', socket.id);
  });
});

// Эндпоинт для сохранения push-подписки
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // Проверяем, нет ли уже такой подписки
  const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
  if (!exists) {
    subscriptions.push(subscription);
    console.log('✅ Push-подписка сохранена. Всего подписок:', subscriptions.length);
  }
  res.status(201).json({ message: 'Подписка сохранена' });
});

// Эндпоинт для удаления push-подписки
app.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
  console.log('❌ Push-подписка удалена. Осталось:', subscriptions.length);
  res.status(200).json({ message: 'Подписка удалена' });
});

// Запуск сервера
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║   🚀 Сервер запущен!                              ║
║   📡 HTTP:  http://localhost:${PORT}               ║
║   🔒 HTTPS: https://localhost:3000 (через npm run https) ║
║   📡 WebSocket: активен                           ║
║   🔔 Push-уведомления: готовы                     ║
╚══════════════════════════════════════════════════╝
  `);
});