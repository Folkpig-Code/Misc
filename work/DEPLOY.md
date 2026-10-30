# Deployment

**Status: NOT DEPLOYED.** This environment has no Google credentials for Apps Script (no clasp login, no gcloud account), and I do not work around Google sign in or consent. No live URL, deployment ID or test results exist yet.

Live URL: _to be filled after step 5_
Deployment ID: _to be filled after step 5_

## Option 1: clasp (about 5 minutes, on your computer)

```
npm install -g @google/clasp
clasp login
```
Also enable the Apps Script API once at https://script.google.com/home/usersettings

```
mkdir booster-app && cd booster-app
# put Code.gs, Index.html, appsscript.json from this Drive folder here
clasp create --type sheets --title "Commande groupee Pokemon Japon" --parentId 1ddnKYMn5L2Us58MPkhPPlVgo7ddRA9MXjaJMBxVbu40
clasp push --force
clasp deploy --description "v1"
clasp deployments
```
`clasp create` writes a `.clasp.json` containing the script ID. Do not commit it with credentials, and never share `~/.clasprc.json`.

## Option 2: manual (about 10 minutes)
Follow SETUP.md. In the deploy dialog choose Execute as: Me, Who has access: Anyone.

## Then
1. Open the script editor, run `getAppData` once and accept the Google consent screen (spreadsheets scope).
2. Deploy as web app: Execute as Me, Access Anyone. Copy the `/exec` URL.
3. Check the checklist below, then send me the URL and I will finish the tests.

## Test checklist
- Page loads logged out and in a private window; tracker shows 0 / 20; 8 products with the right prices.
- Order several products: confirmation shows reference and total; "Commandes WebApp" gets one row per product; tracker rises.
- Invalid input: empty name, 0 boxes, name `=1+1` (must appear as text in the sheet).
- Two orders at the same moment from two browsers: both rows present, tracker adds up.
- Phone width (360 and 390px), light and dark mode.
- Delete your test rows afterwards (keep the header row).

## Publishing updates without changing the URL
Never create a new deployment. Either:
- Editor: Deploy, Manage deployments, pencil icon, Version: New version, Deploy.
- clasp: `clasp push --force` then `clasp deploy --deploymentId <ID> --description "v2"`.

The `/exec` URL stays the same. Changing code without redeploying does not update the live app.
