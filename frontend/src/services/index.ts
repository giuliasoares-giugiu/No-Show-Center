import { api as liveApi } from './api';
import { api as mockApi } from './mockApi';

export const api = import.meta.env.VITE_USE_MOCK === '1' ? mockApi : liveApi;
