const API = {
    async request(path, options = {}) {
        const token = sessionStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        };
        const response = await fetch(`/api${path}`, { ...options, headers });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Something went wrong');
        }
        return response.json();
    },

    auth: {
        async login(username, password) {
            const data = await API.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            });
            sessionStorage.setItem('token', data.token);
            sessionStorage.setItem('user', JSON.stringify(data.user));
            return data;
        },
        async register(userData) {
            return API.request('/auth/register', {
                method: 'POST',
                body: JSON.stringify(userData)
            });
        },
        logout() {
            sessionStorage.clear();
        }
    },

    quizzes: {
        async getAll() {
            return API.request('/quizzes');
        },
        async save(quizData) {
            return API.request('/quizzes', {
                method: 'POST',
                body: JSON.stringify(quizData)
            });
        },
        async delete(id) {
            return API.request(`/quizzes/${id}`, {
                method: 'DELETE'
            });
        }
    },

    results: {
        async save(resultData) {
            return API.request('/results', {
                method: 'POST',
                body: JSON.stringify(resultData)
            });
        },
        async getMy() {
            return API.request('/results/my');
        },
        async getAll() {
            return API.request('/results/all');
        }
    }
};
