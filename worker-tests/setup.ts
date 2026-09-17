import { beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { network } from './network';
beforeAll(() => network.enable());
afterEach(() => network.resetHandlers());
afterAll(() => network.disable());
// Default deny: no test may accidentally contact a paid provider.
beforeEach(() => network.use(http.all('*', () => HttpResponse.error())));
