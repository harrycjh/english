export type AppRoute = 'home' | 'selection' | 'stats' | 'settings' | 'learning' | 'complete';

export const MAIN_APP_ROUTES = ['home', 'selection', 'stats', 'settings'] as const;
export type MainAppRoute = typeof MAIN_APP_ROUTES[number];
export type MainRouteDirection = 'forward' | 'backward';

export function isMainAppRoute(route: AppRoute): route is MainAppRoute {
  return MAIN_APP_ROUTES.includes(route as MainAppRoute);
}

export function getMainRouteDirection(from: MainAppRoute, to: MainAppRoute): MainRouteDirection {
  return MAIN_APP_ROUTES.indexOf(to) > MAIN_APP_ROUTES.indexOf(from) ? 'forward' : 'backward';
}
