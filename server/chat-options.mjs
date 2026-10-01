/** Local DeepSeek-style thinking flags. Absent env leaves the provider request unchanged. */
export function applyThinking(request, env = process.env) {
  const thinking = String(env.LLM_THINKING || '').trim().toLowerCase();
  const effort = String(env.LLM_REASONING_EFFORT || '').trim();
  if (['enabled', 'true', '1', 'on', 'yes'].includes(thinking)) {
    request.thinking = {type: 'enabled'};
    if (effort) request.reasoning_effort = effort;
  } else if (['disabled', 'false', '0', 'off', 'no'].includes(thinking)) {
    request.thinking = {type: 'disabled'};
  } else if (effort) {
    request.reasoning_effort = effort;
  }
  return request;
}
