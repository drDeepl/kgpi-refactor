const dataChannelParams = {
    ordered: true
};

// Инициализация Peer Connection и Data Channel
let peerConnection = null;
let dataChannel = null;
let dataChannelInterval = null;

// Функция создания Peer Connection
function createPeerConnection() {
    const config = {
        sdpSemantics: 'unified-plan',
        iceServers: [
            {
                urls: 'turn:135.181.243.125:3478?transport=udp',
                username: 'user-1',
                credential: 'pass-1'
            }
        ]
        // iceTransportPolicy: "relay" // Раскомментировать, если нужен только relay
    };

    const pc = new RTCPeerConnection(config);

    // Обработка входящих дорожек (tracks)
    pc.addEventListener('track', event => {
        if (event.track.kind === 'video') {
            const videoElement = document.getElementById('video');
            if (videoElement) {
                videoElement.srcObject = event.streams[0];
            } else {
                console.error("Video элемент не найден.");
            }
        }
    });

    // Логирование изменений состояния подключения
    pc.addEventListener('connectionstatechange', () => {
        console.log(`Состояние подключения: ${pc.connectionState}`);
    });

    // Логирование ICE кандидатов
    pc.addEventListener('icecandidate', event => {
        if (event.candidate) {
            console.log('Новый ICE кандидат:', event.candidate);
            // Здесь можно отправить кандидата на сервер для передачи удалённому пиру
        }
    });

    return pc;
}

// Функция для проведения переговоров (negotiation)
async function negotiate() {
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // Ожидание завершения сбора ICE кандидатов
        await new Promise(resolve => {
            if (peerConnection.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (peerConnection.iceGatheringState === 'complete') {
                        peerConnection.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                
                peerConnection.addEventListener('icegatheringstatechange', checkState);
            }
        });

        const offerDescription = peerConnection.localDescription;

        // Отправка предложения на сервер
        const response = await fetch('/api/offer/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sdp: offerDescription.sdp,
                type: offerDescription.type
            })
        });

        if (!response.ok) {
            throw new Error(`Ошибка при получении ответа: ${response.statusText}`);
        }

        const answer = await response.json();

        // Установка удалённого описания
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

        console.log('Переговоры завершены успешно.');
    } catch (error) {
        console.error('Ошибка переговоров:', error);
        alert(`Не удалось провести переговоры: ${error.message}`);
    }
}

// Функция запуска камеры и установки соединения
async function start() {
    try {
        peerConnection = createPeerConnection();

        // Создание Data Channel
        dataChannel = peerConnection.createDataChannel('chat', dataChannelParams);
        dataChannel.onopen = () => {
            console.log('Data Channel открыт.');
            dataChannelInterval = setInterval(() => {
                const message = `ping ${Date.now()}`;
                dataChannel.send(message);
                console.log('Отправлено сообщение:', message);
            }, 1000);
        };
        dataChannel.onclose = () => {
            console.log('Data Channel закрыт.');
            clearInterval(dataChannelInterval);
        };
        dataChannel.onerror = (error) => {
            console.error('Ошибка Data Channel:', error);
        };

        // Получение доступа к камере
        const constraints = {
            audio: false,
            video: true
        };

        const mediaElement = document.getElementById('media');
        if (!mediaElement) {
            console.error("Элемент media не найден.");
            return;
        }
        mediaElement.style.display = 'block';

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream);
        });

        console.log('Локальный медиа поток добавлен к Peer Connection.');

        // Начало переговоров
        await negotiate();
    } catch (error) {
        console.error('Ошибка при старте:', error);
        alert(`Не удалось запустить камеру: ${error.message}`);
    }
}

// Функция остановки камеры и разрыва соединения
function stop() {
    // Закрытие Data Channel
    if (dataChannel) {
        dataChannel.close();
        dataChannel = null;
    }

    // Очистка интервала
    if (dataChannelInterval) {
        clearInterval(dataChannelInterval);
        dataChannelInterval = null;
    }

    // Закрытие Peer Connection
    if (peerConnection) {
        // Остановка всех отправляемых дорожек
        peerConnection.getSenders().forEach(sender => {
            if (sender.track) {
                sender.track.stop();
                peerConnection.removeTrack(sender);
            }
        });

        // Остановка всех трансиверов
        peerConnection.getTransceivers().forEach(transceiver => {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });

        // Закрытие соединения
        peerConnection.close();
        peerConnection = null;
    }

    // Сокрытие медиа элемента

    const mediaElement = document.getElementById('media');
    if (mediaElement) {
        mediaElement.style.display = 'none';
    }

    console.log('Peer Connection и медиа остановлены.');
}

// Добавление слушателей событий для кнопок
document.getElementById('startButton').addEventListener('click', start);
document.getElementById('stopButton').addEventListener('click', stop);

// Автоматический старт при загрузке страницы (опционально)
window.addEventListener('load', () => {
    start(); // Если хотите автоматически запускать на загрузке
});

// Очистка при закрытии страницы
window.addEventListener('beforeunload', () => {
    stop();
});

