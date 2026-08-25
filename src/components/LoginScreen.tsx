import React, { useState } from 'react';
import { CircleAlert, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import cloudstaffLogo from '../assets/cloudstaff-logo.svg';

interface LoginScreenProps {
  onAuthenticated: () => void;
}

const DEFAULT_USERNAME = 'csdatasec';
const DEFAULT_PASSWORD = 'CSd4t4s3c!';

export const LoginScreen: React.FC<LoginScreenProps> = ({ onAuthenticated }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [hasError, setHasError] = useState(false);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isValid =
      username.trim().toLowerCase() === DEFAULT_USERNAME.toLowerCase() &&
      password.trim() === DEFAULT_PASSWORD;
    setHasError(!isValid);
    if (isValid) onAuthenticated();
  };

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={handleSubmit}>
        <img src={cloudstaffLogo} alt="Cloudstaff" className="login-logo" />
        <div>
          <h1>Project Issue Analytics</h1>
          <p>Sign in to access the issue workspace.</p>
        </div>

        {hasError && (
          <div className="login-error-alert" role="alert">
            <CircleAlert className="w-4 h-4 shrink-0" />
            <span>Incorrect username or password. Please try again.</span>
          </div>
        )}

        <label>
          <span>Username</span>
          <div className={`login-input ${hasError ? 'login-input-error' : ''}`}>
            <UserRound className="w-4 h-4" />
            <input value={username} onChange={event => { setUsername(event.target.value); setHasError(false); }} autoComplete="username" required />
          </div>
        </label>
        <label>
          <span>Password</span>
          <div className={`login-input ${hasError ? 'login-input-error' : ''}`}>
            <LockKeyhole className="w-4 h-4" />
            <input type="password" value={password} onChange={event => { setPassword(event.target.value); setHasError(false); }} autoComplete="current-password" required />
          </div>
        </label>
        <button type="submit" className="login-submit">
          <LogIn className="w-4 h-4" />
          <span>Sign in</span>
        </button>
      </form>
    </main>
  );
};