'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { User, Lock, Save, ArrowLeft, Eye, EyeOff, Camera } from 'lucide-react';
import { useAuth } from '@/contexts/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import apiConfig from '@/config/api.config';
import { useTranslation } from 'react-i18next';

export default function ProfilePage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || ''
      });
      // Set profile image if exists
      if (user.profile_image) {
        setProfileImage(user.profile_image);
      }
    }
  }, [user]);

  if (!user) {
    // If user is not logged in, redirect to login page
    router.push('/login');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-primary rounded-full mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const response = await fetch(apiConfig.getApiUrl('/api/v2/users/profile'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('profile.notifications.profileUpdateFailed'));
      }

      const data = await response.json();

      // Update user in localStorage
      localStorage.setItem('user', JSON.stringify(data.user));

      toast({
        title: t('common.success'),
        description: t('profile.notifications.profileUpdated'),
      });

    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profile.notifications.profileUpdateFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    // Validation
    const newErrors: typeof errors = {};

    if (!passwordData.currentPassword) {
      newErrors.currentPassword = t('profile.passwordChange.errors.currentPasswordRequired');
    }

    if (!passwordData.newPassword) {
      newErrors.newPassword = t('profile.passwordChange.errors.newPasswordRequired');
    } else if (passwordData.newPassword.length < 6) {
      newErrors.newPassword = t('profile.passwordChange.errors.newPasswordMinLength');
    }

    if (!passwordData.confirmPassword) {
      newErrors.confirmPassword = t('profile.passwordChange.errors.confirmPasswordRequired');
    } else if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = t('profile.passwordChange.errors.passwordsDoNotMatch');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(apiConfig.getApiUrl('/api/v2/users/change-password'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('profile.notifications.passwordChangeFailed'));
      }

      toast({
        title: t('common.success'),
        description: t('profile.notifications.passwordChanged'),
      });

      // Reset password form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordForm(false);

    } catch (error) {
      console.error('Password change error:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profile.notifications.passwordChangeFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('common.error'),
        description: t('profile.profileImage.errors.invalidFileType'),
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: t('profile.profileImage.errors.fileTooLarge'),
        variant: 'destructive',
      });
      return;
    }

    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('profileImage', file);

      const response = await fetch(apiConfig.getApiUrl('/api/v2/users/upload-profile-image'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('profile.profileImage.errors.uploadFailed'));
      }

      const data = await response.json();

      // Update user in localStorage
      const updatedUser = { ...user, profile_image: data.profileImage };
      localStorage.setItem('user', JSON.stringify(updatedUser));

      setProfileImage(data.profileImage);

      toast({
        title: t('common.success'),
        description: t('profile.notifications.photoUpdated'),
      });

    } catch (error) {
      console.error('Image upload error:', error);
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('profile.notifications.photoUpdateFailed'),
        variant: 'destructive',
      });
    } finally {
      setUploadingImage(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header - Dashboard ile uyumlu */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('profile.title')}</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.subtitle')}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Info Card */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('profile.basicInfo.title')}
                </CardTitle>
                <CardDescription>
                  {t('profile.basicInfo.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t('profile.basicInfo.nameLabel')}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder={t('profile.basicInfo.namePlaceholder')}
                      disabled={loading}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t('profile.basicInfo.emailLabel')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder={t('profile.basicInfo.emailPlaceholder')}
                      disabled={loading}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email}</p>
                    )}
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? t('profile.basicInfo.savingButton') : t('profile.basicInfo.saveButton')}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Password Change */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  {t('profile.passwordChange.title')}
                </CardTitle>
                <CardDescription>
                  {t('profile.passwordChange.description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!showPasswordForm ? (
                  <Button
                    variant="outline"
                    onClick={() => setShowPasswordForm(true)}
                    className="w-full"
                  >
                    <Lock className="h-4 w-4 mr-2" />
                    {t('profile.actions.changePassword')}
                  </Button>
                ) : (
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">{t('profile.passwordChange.currentPasswordLabel')}</Label>
                      <div className="relative">
                        <Input
                          id="currentPassword"
                          type={showCurrentPassword ? "text" : "password"}
                          value={passwordData.currentPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                          placeholder={t('profile.passwordChange.currentPasswordPlaceholder')}
                          disabled={loading}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {errors.currentPassword && (
                        <p className="text-sm text-destructive">{errors.currentPassword}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="newPassword">{t('profile.passwordChange.newPasswordLabel')}</Label>
                      <div className="relative">
                        <Input
                          id="newPassword"
                          type={showNewPassword ? "text" : "password"}
                          value={passwordData.newPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                          placeholder={t('profile.passwordChange.newPasswordPlaceholder')}
                          disabled={loading}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {errors.newPassword && (
                        <p className="text-sm text-destructive">{errors.newPassword}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t('profile.passwordChange.confirmPasswordLabel')}</Label>
                      <div className="relative">
                        <Input
                          id="confirmPassword"
                          type={showConfirmPassword ? "text" : "password"}
                          value={passwordData.confirmPassword}
                          onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                          placeholder={t('profile.passwordChange.confirmPasswordPlaceholder')}
                          disabled={loading}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {errors.confirmPassword && (
                        <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" disabled={loading} className="flex-1">
                        <Save className="h-4 w-4 mr-2" />
                        {loading ? t('profile.passwordChange.changingButton') : t('profile.passwordChange.changeButton')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowPasswordForm(false);
                          setPasswordData({
                            currentPassword: '',
                            newPassword: '',
                            confirmPassword: ''
                          });
                          setErrors({});
                        }}
                      >
                        {t('profile.passwordChange.cancelButton')}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          {/* User Info Card - Combined */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('profile.profileImage.title')}</CardTitle>
                <CardDescription>
                  {t('profile.profileImage.description')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Profile Image Section */}
                <div className="text-center">
                  <div className="relative inline-block cursor-pointer mx-auto" onClick={() => fileInputRef.current?.click()}>
                    <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700">
                      {profileImage ? (
                        <img
                          src={profileImage.startsWith('http') ? profileImage : `${process.env.NEXT_PUBLIC_API_URL || ""}/uploads/${profileImage}`}
                          alt="Profile"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error('Profile image load error:', e);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="h-12 w-12 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute bottom-0 right-0 shadow-lg bg-white dark:bg-gray-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? (
                        <div className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-primary rounded-full" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500 mt-3">{t('profile.profileImage.changePhoto')}</p>
                </div>

                {/* User Info Section */}
                <div className="text-center space-y-2 pt-4 border-t">
                  <h3 className="font-semibold text-lg">{user.name}</h3>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>

                {/* Account Details */}
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('profile.accountDetails.role')}</span>
                    <span className="font-medium">
                      {user.role === 'admin' ? t('profile.accountDetails.admin') : t('profile.accountDetails.user')}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('profile.accountDetails.status')}</span>
                    <span className="font-medium">
                      {user.status === 'active' ? t('profile.accountDetails.active') : user.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('profile.accountDetails.emailVerification')}</span>
                    <span className="font-medium">
                      {user.email_verified ? t('profile.accountDetails.verified') : t('profile.accountDetails.unverified')}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t('profile.accountDetails.membershipDate')}</span>
                    <span className="font-medium">
                      {new Date(user.created_at).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Geri Dön Butonu */}
            <Card>
              <CardContent className="pt-6">
                <Link href="/" className="block">
                  <Button variant="outline" className="w-full">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t('profile.actions.backToHome')}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}