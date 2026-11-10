import { useState } from 'react';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { connect, type Credentials } from './api';

/**
 * Credentials for the source: a Hasura JWT, and a Cloudflare service token or the cookie of a
 * browser session. The server keeps them in memory until it stops.
 */
export function ConnectForm({ onConnected }: { onConnected: () => void }) {
    const [credentials, setCredentials] = useState<Credentials>({});
    const [error, setError] = useState<string | null>(null);
    const field = (key: keyof Credentials, label: string) => (
        <label>
            {label}
            <InputText
                type="password"
                value={credentials[key] ?? ''}
                onChange={e => setCredentials({ ...credentials, [key]: e.target.value || undefined })}
            />
        </label>
    );

    return (
        <form
            className="panel connect"
            onSubmit={e => {
                e.preventDefault();
                connect(credentials).then(onConnected, (err: unknown) => setError(String(err)));
            }}
        >
            <h2>Connect to the source</h2>
            <p>What is stored can be read without this; fetching needs it.</p>
            {field('token', 'Hasura JWT')}
            {field('cfAccessClientId', 'Cloudflare service token: client id')}
            {field('cfAccessClientSecret', 'Cloudflare service token: client secret')}
            {field('cfAuthorization', 'Or the CF_Authorization cookie')}
            {error !== null && <p className="error">{error}</p>}
            <Button type="submit" label="Connect" />
        </form>
    );
}
