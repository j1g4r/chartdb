import React, { useEffect, useState } from 'react';
import {
    api,
    type SessionResponse,
    type SessionUser,
} from '@/lib/api/server-storage';

export const AuthButton: React.FC = () => {
    const [user, setUser] = useState<SessionUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        api.session()
            .then((res: SessionResponse) => {
                if (!mounted) return;
                setUser(res?.user ?? null);
                setLoading(false);
            })
            .catch(() => setLoading(false));
        return () => {
            mounted = false;
        };
    }, []);

    const signIn = async () => {
        const email = window.prompt('Email:');
        if (!email) return;
        const password = window.prompt('Password:');
        if (!password) return;
        try {
            await api.signup(email, password);
        } catch {
            // if already exists, try login
            await api.login(email, password);
        }
        const res = (await api.session()) as SessionResponse;
        setUser(res?.user ?? null);
        alert('Signed in');
    };

    const signOut = async () => {
        await api.logout();
        setUser(null);
    };

    if (loading) return null;

    return user ? (
        <button
            className="text-xs underline"
            onClick={signOut}
            title={user.email}
        >
            Logout
        </button>
    ) : (
        <button className="text-xs underline" onClick={signIn}>
            Sign In
        </button>
    );
};
