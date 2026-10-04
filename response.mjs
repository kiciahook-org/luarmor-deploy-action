const MAX_MESSAGE_LENGTH = 300;

function cleanMessage(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_LENGTH);
}

export async function responseError(response) {
  let message = "";
  try {
    const body = await response.clone().json();
    message = cleanMessage(body?.message);
  } catch {
    // Luarmor does not consistently return JSON error bodies.
  }
  const suffix = message ? `: ${message}` : "";
  return new Error(`Luarmor request failed (HTTP ${response.status})${suffix}`);
}

export async function requireSuccessfulResponse(response, { allowGatewayTimeout = false } = {}) {
  if (response.ok || (allowGatewayTimeout && response.status === 504)) return response;
  throw await responseError(response);
}

export async function requireSuccessfulUpdateResponse(response) {
  await requireSuccessfulResponse(response, { allowGatewayTimeout: true });
  if (response.status === 504) return response;
  try {
    const body = await response.clone().json();
    if (body?.success === false) {
      const message = cleanMessage(body.message);
      const suffix = message ? `: ${message}` : "";
      throw new Error(`Luarmor update rejected (HTTP ${response.status})${suffix}`);
    }
  } catch (error) {
    if (error instanceof SyntaxError) return response;
    throw error;
  }
  return response;
}
