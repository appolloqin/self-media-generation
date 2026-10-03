/** 最小 OpenAI 兼容 mock server，用于验证自定义服务商端到端可用 */
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 5299);
const seen = [];

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const auth = req.headers.authorization ?? '';
    const info = { method: req.method, url: req.url, auth, body: body.slice(0, 200) };
    seen.push(info);
    console.log(`[mock] ${req.method} ${req.url} auth=${auth || '(none)'}`);

    const json = (obj) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };

    if (req.url.endsWith('/models')) {
      return json({ data: [{ id: 'mock-model-a' }, { id: 'mock-model-b' }] });
    }
    if (req.url.endsWith('/chat/completions')) {
      let model = 'unknown';
      try {
        model = JSON.parse(body).model;
      } catch {}
      return json({
        id: 'chatcmpl-mock',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: `正常 (${model})` }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }
    res.writeHead(404).end('not found');
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[mock] OpenAI 兼容 mock 已启动: http://127.0.0.1:${PORT}/v1`));
