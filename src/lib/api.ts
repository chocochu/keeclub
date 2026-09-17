import { createApi } from './api-client';

export { ApiError } from './api-client';
export const api = createApi(location.origin);
