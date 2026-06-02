# Frontend Module Roles

- `app.js`: Browser entry point. It only loads the ES module runtime.
- `js/app-runtime.js`: Application bootstrap, routing, shared state persistence, common event wiring, and compatibility bridge for existing analysis panels.
- `js/core/`: Shared DOM, tab rendering, and page registry utilities.
- `js/pages/`: Top-level page modules such as the home screen.
- `js/analysis/customs/`: Customs investigation page, tabs, state, and click-event registration.
- `js/analysis/general-investigation/`: General investigation page, tabs, state, and click-event registration.
- `js/analysis/special-investigation/`: Drug and foreign-exchange investigation shared page, tabs, state, and click-event registration.

Keep feature behavior and stored localStorage keys stable when moving code between these modules.
