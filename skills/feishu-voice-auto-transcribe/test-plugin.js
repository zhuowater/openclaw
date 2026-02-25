// 测试插件
const plugin = require('./plugin');

const result = plugin();
console.log('Plugin manifest:', JSON.stringify(result.manifest, null, 2));
