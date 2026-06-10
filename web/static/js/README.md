# Frontend Module Roles

- `app.js`: Browser entry point. It only loads the ES module runtime.
- `js/app-runtime.js`: Application bootstrap, routing, shared state persistence, common event wiring, shared data/helper providers, and page-module wiring.
- `js/core/`: Shared DOM, tab rendering, and page registry utilities.
- `js/pages/`: Top-level page modules such as the home screen.
- `js/analysis/shared/`: Shared analysis metadata helpers, standardized AI agent requirements/actions for subtabs, and Super admin scenario configuration state.
- `js/analysis/customs/`: Customs investigation page, independent subtab UI modules, state, and click-event registration.
- `js/analysis/general-investigation/`: General investigation page, independent subtab UI modules, state, and click-event registration.
- `js/analysis/special-investigation/`: Drug and foreign-exchange investigation shared page, independent subtab UI modules, state, and click-event registration.

Keep feature behavior and stored localStorage keys stable when moving code between these modules.
