import axios, { type InternalAxiosRequestConfig } from "axios";

export const api = axios.create({
  baseURL: "/api/v1",
});

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
      "/api/v1/auth/refresh",
      { refresh_token: refreshToken }
    );
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("refresh_token", data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const activeOrgId = localStorage.getItem("active_org_id");
  if (activeOrgId) {
    config.headers["X-Org-ID"] = activeOrgId;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as RetryableConfig | undefined;
    const status = error.response?.status;
    const isAuthEndpoint =
      original?.url?.includes("/auth/login") ||
      original?.url?.includes("/auth/register") ||
      original?.url?.includes("/auth/refresh");

    if (status === 401 && original && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }

      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.dispatchEvent(new Event("autoprep:unauthorized"));
    }

    return Promise.reject(error);
  }
);

export function getApiErrorMessage(err: unknown, fallback = "An unexpected error occurred"): string {
  const e = err as { response?: { data?: { error?: { message?: string }; detail?: string } } };
  return e?.response?.data?.error?.message || e?.response?.data?.detail || fallback;
}
