'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Mail, Lock, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useTranslation } from 'react-i18next';

interface RegisterData {
  username: string;
  email: string;
  password: string;
  name: string;
}

export default function RegisterForm() {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<RegisterData>({
    username: '',
    email: '',
    password: '',
    name: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { login } = useAuth();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (error) setError(null);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate passwords match
    if (formData.password !== confirmPassword) {
      setError(t('register.errors.passwordMismatch'));
      setLoading(false);
      return;
    }

    // Validate password length
    if (formData.password.length < 8) {
      setError(t('register.errors.passwordTooShort'));
      setLoading(false);
      return;
    }

    try {
      // Call register API
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || t('register.errors.registrationFailed'));
        setLoading(false);
        return;
      }

      // Auto-login after successful registration
      const loginResult = await login(formData.email, formData.password);

      if (loginResult.success) {
        router.push('/dashboard');
      } else {
        setError(t('register.errors.loginAfterRegistrationFailed'));
      }

    } catch (err) {
      setError(t('register.errors.registrationError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleRegister} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">{t('register.nameLabel')}</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="name"
            name="name"
            type="text"
            placeholder={t('register.namePlaceholder')}
            value={formData.name}
            onChange={handleChange}
            className="pl-10"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="username">{t('register.usernameLabel')}</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="username"
            name="username"
            type="text"
            placeholder={t('register.usernamePlaceholder')}
            value={formData.username}
            onChange={handleChange}
            className="pl-10"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('register.emailLabel')}</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={t('register.emailPlaceholder')}
            value={formData.email}
            onChange={handleChange}
            className="pl-10"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('register.passwordLabel')}</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            placeholder={t('register.passwordPlaceholder')}
            value={formData.password}
            onChange={handleChange}
            className="pl-10 pr-10"
            required
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 transform -translate-y-1/2"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 text-gray-400" />
            ) : (
              <Eye className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </div>
        {formData.password && formData.password.length < 8 && (
          <p className="text-sm text-red-600">{t('register.validation.passwordMinLength')}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t('register.confirmPasswordLabel')}</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            placeholder={t('register.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError(null);
            }}
            className="pl-10"
            required
          />
        </div>
        {confirmPassword && formData.password !== confirmPassword && (
          <p className="text-sm text-red-600">{t('register.errors.passwordMismatch')}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={
          loading ||
          formData.password.length < 8 ||
          formData.password !== confirmPassword ||
          !formData.name.trim() ||
          !formData.username.trim() ||
          !formData.email.trim()
        }
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t('register.registering')}
          </>
        ) : (
          t('register.registerButton')
        )}
      </Button>
    </form>
  );
}