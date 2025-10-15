export const API_BASE = import.meta.env.VITE_API_BASE || '';

export interface SessionUser {
    id: number;
    email: string;
}

export interface SessionResponse {
    user?: SessionUser | null;
}

async function request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
        ...options,
    });
    if (!res.ok) {
        let err: { error?: string } | undefined;
        try {
            err = await res.json();
        } catch {
            err = { error: res.statusText };
        }
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return res.json();
    return res.text();
}

export const api = {
    // Auth
    signup(email: string, password: string) {
        return request('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
    login(email: string, password: string) {
        return request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
    },
    logout() {
        return request('/api/auth/logout', { method: 'POST' });
    },
    session(): Promise<SessionResponse> {
        return request('/api/session');
    },

    // Workspaces
    listWorkspaces(): Promise<{ id: string; name: string }[]> {
        return request('/api/workspaces');
    },
    createWorkspace({
        id,
        name,
        diagram,
    }: {
        id: string;
        name: string;
        diagram: unknown;
    }) {
        return request('/api/workspaces', {
            method: 'POST',
            body: JSON.stringify({ id, name, diagram }),
        });
    },
    getWorkspace(id: string) {
        return request(`/api/workspaces/${id}`);
    },
    updateWorkspace(id: string, body: { name?: string; diagram?: unknown }) {
        return request(`/api/workspaces/${id}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    },
};
