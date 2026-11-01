
// We can read charger status through CSMS



const { WebSocketServer, WebSocket } = require('ws');
const wss = new WebSocketServer({ port: 8080 });


// Ping chargers for every 30 seconds for status updates

const foundChargers = [];

function pingChargers() {

    return setInterval(() => {
        wss.clients.forEach((ws) => {
            const status = checkChargerStatus(ws);

            if (status === 'online') {
                if (!foundChargers.includes(ws)) {
                    foundChargers.push(ws);
                }
            }

            else if (status === 'offline') {

                const sumfailure = foundChargers.indexOf(ws);

                if (sumfailure !== -1) {
                    foundChargers.splice(sumfailure, 1);
                }
            }
        });
    }, 30000);
}


wss.on('connection', (ws) => {
    ws.on('close', () => {
        const index = foundChargers.indexOf(ws);
        if (index !== -1) {
            foundChargers.splice(index, 1);
        }
    });
    ws.on('error', () => ws.terminate());
});


function checkChargerStatus(ws) {
    switch (ws.readyState) {
        case WebSocket.CONNECTING:
            return 'connecting';
        case WebSocket.OPEN:
            ws.send(JSON.stringify({ message: 'Checking Status ONLINE......' }));
            return 'online';
        case WebSocket.CLOSING:
            return 'closing';
        case WebSocket.CLOSED:
            return 'offline';
        default:
            return 'unknown';
    }
}


// wss.clients is the set of connected chargers (WebSocket.length is not a count of anything)
function hasChargers() {
    return wss.clients.size > 0;
}


module.exports = { checkChargerStatus, hasChargers, pingChargers };