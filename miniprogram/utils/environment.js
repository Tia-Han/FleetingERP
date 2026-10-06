function resolveEnvironment(wxApi) {
  const version = wxApi.getAccountInfoSync().miniProgram.envVersion;
  if (!['develop','trial','release'].includes(version)) throw new Error('无法识别运行环境，停止连接');
  const local = version === 'develop' && wxApi.getSystemInfoSync().platform === 'devtools';
  return { local, apiBase: local ? 'http://127.0.0.1:3301/api/v1' : 'https://api.fleetingerp.cn/api/v1', storagePrefix: local ? 'local-dev:' : '' };
}
module.exports = { resolveEnvironment };
