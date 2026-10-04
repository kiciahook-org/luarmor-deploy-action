// Dependencies
import * as fs from "fs";
import { setFailed, getInput } from "@actions/core";
import { stateActionHandler } from "fetch-rate-limit-util";
import { Solver } from "@2captcha/captcha-solver";
import { requireSuccessfulResponse, requireSuccessfulUpdateResponse } from "./response.mjs";

/**
 * The main entry point
 * @returns {Promise<void>}
 * @throws {Error} If the project id cannot be resolved or captcha fails
 */
async function run() {
  // Grab the variables
  const twoCaptchaApiKey = getInput("twocaptcha-api-key");
  const apiKey = getInput("api-key");
  const scriptId = getInput("script-id");
  let projectId = getInput("project-id");
  const filePath = getInput("file");

  // Grab the current details
  const details = await getKeyDetails(apiKey);

  // Resolve the projectId, if it's not specified
  const project = resolveProject(details, scriptId, projectId);
  if (!project) {
    throw new Error("could not find project. invalid projectId or scriptId?");
  }

  // Extract the current version number (script object contains `script_version`)
  const currentScript = getScript(project, scriptId);
  const currentVersion = currentScript?.script_version;
  if (!currentVersion) {
    throw new Error(
      "could not get current script version. this should not happen."
    );
  }

  // Read the file
  const file = await fs.promises
    .readFile(filePath)
    .then((data) => data.toString());

  // Attempt to update the script
  const solver = new Solver(twoCaptchaApiKey);
  const updateResponse = await updateScript(
    scriptId,
    project.id,
    {
      ffa: currentScript.ffa,
      heartbeat: currentScript.heartbeat,
      is_v4_loader: true,
      lightning: currentScript.lightning,
      script: file,
      silent: currentScript.silent,
    },
    apiKey,
    solver
  );

  // An accepted request is not deployment proof. Wait for the exact script's
  // externally observable version to change, including after a 2xx response.
  await pollVersionNumber(apiKey, project.id, scriptId, currentVersion);
}

/**
 * Rejects every non-2xx response except an explicitly allowed update timeout.
 * @param {string} url - The URL to fetch
 * @param {object} options - The fetch options
 * @param {boolean} [allowGatewayTimeout=false] - Allow a 504 for asynchronous update polling
 * @returns {Promise<Response>} The successful response
 * @throws {Error} If the request is rejected
 */
async function sendFetch(url, options, allowGatewayTimeout = false) {
  const response = await stateActionHandler(url, options);
  return requireSuccessfulResponse(response, { allowGatewayTimeout });
}

/**
 * Fetches the details of the API key
 * @param {string} apiKey - The API key
 * @returns {Promise<object>} The API key details
 */
async function getKeyDetails(apiKey) {
  return await (
    await sendFetch(`https://api.luarmor.net/v3/keys/${apiKey}/details`)
  ).json();
}

/**
 * Resolve a project, given a script id
 * @param {object} details - The entire API key details
 * @param {string} scriptId - The script ID
 * @param {string} [projectId] - The project ID (optional)
 * @returns {object | undefined} The project object or `undefined` if not found
 */
function resolveProject(details, scriptId, projectId = null) {
  if (projectId && projectId !== "") {
    return details.projects.find((project) => project.id === projectId);
  }

  return details.projects.find((project) =>
    project.scripts.some((script) => script.script_id === scriptId)
  );
}

/**
 * Get the script object, given a script id.
 *
 * Returns an object matching the script schema used by the API. Example:
 * {
 *   script_name: 'test',
 *   script_id: 'f731670a759510a40a5a326ea19b8daa',
 *   script_version: '0005',
 *   ffa: false,
 *   silent: false,
 *   heartbeat: true,
 *   lightning: false,
 *   verified: false,
 *   enabled: true,
 *   is_v4_loader: true,
 *   last_edited: 1763917959
 * }
 *
 * @param {object} project - The project details
 * @param {string} scriptId - The script ID
 * @returns {{
 *  script_name: string
 *  script_id: string,
 *  script_version: string,
 *  ffa: boolean,
 *  silent: boolean,
 *  heartbeat: boolean,
 *  lightning: boolean,
 *  verified: boolean,
 *  enabled: boolean,
 *  is_v4_loader: boolean,
 *  last_edited: number
 * } | undefined} The script object or `undefined` if not found
 */
function getScript(project, scriptId) {
  return project.scripts.find((script) => script.script_id === scriptId);
}

/**
 * Poll for a changed script version after an update gateway timeout.
 * @param {string} apiKey - The API key
 * @param {string} projectId - The project's id
 * @param {string} scriptId - The script's id
 * @param {string} oldVersion - The version before upload
 * @returns {Promise<void>}
 */
async function pollVersionNumber(apiKey, projectId, scriptId, oldVersion) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const details = await getKeyDetails(apiKey);
    const project = resolveProject(details, scriptId, projectId);
    const newVersion = project ? getScript(project, scriptId)?.script_version : undefined;
    if (newVersion && newVersion !== oldVersion) {
      console.log(`New script version: ${newVersion}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error("Luarmor script version did not change within 120 seconds");
}

/**
 * Update a script
 * @param {string} scriptId - The script ID
 * @param {string} projectId - The project ID
 * @param {Object} scriptData - The data of the script, i.e. ffa, heartbeat, etc.
 * @param {string} apiKey - The API key
 * @param {Solver} captchaSolver - The 2captcha solver
 * @returns {Promise<Response>}
 */
async function updateScript(
  scriptId,
  projectId,
  scriptData,
  apiKey,
  captchaSolver
) {
  // Attempt to solve the turnstile
  const pageUrl = `https://api.luarmor.net/v3/projects/${projectId}/scripts/${scriptId}`;
  const cfTurnstile = await captchaSolver
    .cloudflareTurnstile({
      pageurl: pageUrl,
      sitekey: "0x4AAAAAAA8DOlG4zxR4fbCf",
    })
    .then((x) => x.data);

  const response = await stateActionHandler(pageUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
      "x-turnstile-token": cfTurnstile,
    },
    body: JSON.stringify(scriptData),
  });
  return requireSuccessfulUpdateResponse(response);
}

// Run the entrypoint, handling errors
try {
  await run();
} catch (error) {
  setFailed(error.message);
}
