# Rigsby West Portal

Family First Division deal portal. AnnieMac Home Mortgage, western region.
Author: Derek Rigsby. Internal use only.

Everything below happens in a web browser. No terminal, no installs, ever.
There are two packages. THE DEMO ZIP has the deal data baked in: it stays on
your machine, you never upload it anywhere. THE PUBLISH ZIP is this one: it
carries no deal data at all and is the only thing that ever touches GitHub.
Data lives in the database behind sign-in, never in this repo. Do not commit
data to this repo, ever.

## Window 1 · GitHub, about 10 minutes
1. github.com, sign in (or Sign up, it is free).
2. Top right + button, New repository. Name: `rigsbywest-portal`. Public.
   Check "Add a README". Create repository.
3. On the repo page: Add file, Upload files. Drag in EVERYTHING from the
   PUBLISH zip (the folder contents, not the folder itself, so `public`,
   `firestore.rules`, `firebase.json`, this README land at the top level).
   Commit changes.
4. Settings tab, Pages (left menu). Under Build and deployment, Source:
   Deploy from a branch. Branch: `main`, folder `/ (root)`. Save.
5. Wait about a minute, refresh. Pages shows your site address, like
   `https://YOURNAME.github.io/rigsbywest-portal/`. Your site is on that
   address plus `/public/` at the end:
   `https://YOURNAME.github.io/rigsbywest-portal/public/`
   Open it. You will see "Setup in progress". That is correct. Keep the
   address handy for Window 2.

## Window 2 · Firebase, about 12 minutes
1. console.firebase.google.com, sign in with your Google account.
2. Create a project. Name: `rigsbywest`. Turn OFF Google Analytics. Create.
3. Left menu: Build, Authentication. Get started. Sign-in method tab.
   Click Google, flip Enable, pick your email as support email. Save.
4. Still in Authentication: Settings tab, Authorized domains, Add domain.
   Type your GitHub address host only: `YOURNAME.github.io`. Add.
5. Left menu: Build, Firestore Database. Create database. Start in
   production mode. Pick the nearest United States location. Enable.
6. Firestore, Rules tab. Delete what is in the editor, paste the entire
   contents of the `firestore.rules` file from this repo, Publish.
7. Firestore, Data tab. Start collection. Collection ID: `users`. Document
   ID: `derek.rigsby@gmail.com` (the exact email you sign in with). Add
   these fields, exact spelling:
   - `name` string `Derek Rigsby`
   - `active` boolean `true`
   - `divisionDealsOk` boolean `true`
   - `roles` map, inside it: `admin` boolean `true`, `dealCreator` boolean `true`
   - `surfaces` map, inside it: `deals` string `full`, `economics` string
     `full`, `pipelines` string `full`, `dashboards` string `full`,
     `boards` boolean `true`, `leadLane` boolean `true`,
     `marketingLane` boolean `true`
   Save. This one document is the master key. Everyone else gets added
   from inside the portal later.
8. Gear icon top left, Project settings. Under Your apps, click the `</>`
   web icon. App nickname `portal`. Register app. It shows a code block:
   you only need three values from it: `apiKey`, `authDomain`, `projectId`.
   Keep this tab open.

## Connect the two, about 3 minutes
1. In GitHub, open `public/config.js`, click the pencil to edit.
2. Replace the three PASTE_ME values with the three values from Firebase.
   Mind the quotes. Commit changes.
3. Wait a minute for Pages to republish, then open your site address.
   Sign in with Google. You are in.

## Load the data, about 2 minutes
1. In the portal, open Admin, find Initialize workspace.
2. On your own machine, open the DEMO zip, open `seed/seed.json` in any
   text editor, select all, copy.
3. Paste into the box, click Load workspace data. Boards light up.

## Adding people
Admin guidance panel explains it: create their doc in the `users`
collection with the exact Google email they sign in with, copy the shape
of an existing user, set `active` true. Corey stays inactive until his
gate clears. Jodey's division economics turn on by setting
`divisionDealsOk` to true, after Gabe's OK.

## House rules carried in code
Share views carry no dollars. Full economics sit behind a guarded click
and a server-side rule. Activity is logged and the sign-in screen says so.
Breakeven strip on every deal. No em dashes anywhere.
