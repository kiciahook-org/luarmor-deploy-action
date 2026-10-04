# Luarmor Deploy

Deploy your script file to Luarmor.

> [!WARNING]
> You must self-host your GitHub runner and whitelist your server's IP on the Luarmor site for this to work.
> This is due to limitations imposed by Luarmor themselves.

This fork rejects every non-success Luarmor response and reports only its HTTP
status plus the API's bounded `message` field. It also rejects `success: false`
payloads returned with HTTP 200. Every accepted update, including a `504`,
must change the exact script's observable version within two minutes.

## Inputs

![an image showing the project-id and script-id](./assets/inputsExample.png)

### `twocaptcha-api-key`

**Required** Your secret [2captcha](https://2captcha.com/enterpage) API key.
This is required since Luarmor has added a Cloudflare Turnstile CAPTCHA to its update script endpoint.

### `api-key`

**Required** Your secret Luarmor API key.
This should be stored in GitHub secrets.

### `script-id`

**Required** The id of the script you want to upload the [file](#file) to.

### `project-id`

**Optional** The id of the project that the [script](#script-id).
If this is not specified, it's automatically resolved for you.

### `file`

**Required** The path to the script file to deploy.

## Outputs

N/A

## Example usage

```yaml
name: Deploy Script

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: [self-hosted]

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Deploy to Luarmor
      uses: kiciahook-org/luarmor-deploy-action@v2.0.2
      with:
        twocaptcha-api-key: ${{ secrets.TWOCAPTCHA_API_KEY }}
        api-key: ${{ secrets.LUARMOR_API_KEY }}
        script-id: "your-script-id"
        project-id: "your-project-id" # Optional
        file: "path/to/your/script/file"
```
