import { useState, useEffect, useRef } from 'react';
import * as api from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import Avatar from '../components/common/Avatar';
import StatusBadge from '../components/common/StatusBadge';
import { AVATAR_PRESETS, AvatarPreset } from '../utils/avatarPresets';
import { calculateCropBounds } from '../utils/cropUtils';

interface ProfileData {
  user_id: string;
  email: string;
  username: string;
  full_name: string;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  is_profile_public: boolean;
  avatar_key: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
  is_verified: boolean;
  pending_email: string | null;
  phone_number: string | null;
  phone_verified: boolean;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

const maskPhoneNumber = (e164: string): string => {
  const digits = e164.replace(/^\+/, '');
  if (digits.length <= 4) return e164;
  const visible = digits.slice(-4);
  return `+${'*'.repeat(digits.length - 4)}${visible}`;
};

const isPhoneNumberPlausible = (value: string): boolean => /^\+?\d{7,15}$/.test(value.replace(/[^\d+]/g, ''));

export default function Profile() {
  const { updateUser } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Floating Toast State
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    full_name: '',
    bio: '',
    pronouns: '',
    location: '',
    is_profile_public: false,
  });

  // Password Change Mode
  const [changePasswordMode, setChangePasswordMode] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Email Change State
  const [emailChangeMode, setEmailChangeMode] = useState(false);
  const [emailChangeData, setEmailChangeData] = useState({ new_email: '', current_password: '' });
  const [emailChangeSaving, setEmailChangeSaving] = useState(false);
  const [resendSaving, setResendSaving] = useState(false);

  // Phone Verification State
  const [phoneNumberInput, setPhoneNumberInput] = useState('');
  const [phoneChangeMode, setPhoneChangeMode] = useState(false);
  const [phoneRequestSaving, setPhoneRequestSaving] = useState(false);
  const [phoneOtpInput, setPhoneOtpInput] = useState('');
  const [phoneVerifySaving, setPhoneVerifySaving] = useState(false);
  const [phoneResendSaving, setPhoneResendSaving] = useState(false);

  // Avatar Modal & Crop State
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarModalTab, setAvatarModalTab] = useState<'upload' | 'preset'>('upload');
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropZoom, setCropZoom] = useState<number>(1);
  const [cropPan, setCropPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Presets State
  const [presetCategory, setPresetCategory] = useState<'all' | 'people' | 'animals' | 'simple'>('all');
  const [selectedPreset, setSelectedPreset] = useState<AvatarPreset | null>(AVATAR_PRESETS[0]);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  // Keyboard accessibility (Escape key closes modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAvatarModal) closeAvatarModal();
        if (changePasswordMode) handleCancelPasswordChange();
        if (editMode) handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAvatarModal, changePasswordMode, editMode]);

  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});
  const [expandedPrefCat, setExpandedPrefCat] = useState<string | null>('WORK & ASSIGNMENTS');

  const fetchNotificationPrefs = async () => {
    try {
      const res = await api.getNotificationPreferences();
      setNotificationPrefs(res.data.data || res.data || {});
    } catch {
      // Non-fatal
    }
  };

  const handleTogglePref = async (key: string, val: boolean) => {
    const updated = { ...notificationPrefs, [key]: val };
    setNotificationPrefs(updated);
    try {
      await api.updateNotificationPreferences({ [key]: val });
      showToast('Notification setting updated', 'success');
    } catch {
      showToast('Failed to update notification setting', 'error');
      setNotificationPrefs(notificationPrefs);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await api.getMyProfile();
      setProfile(response.data.data);
      setEditData({
        full_name: response.data.data.full_name || '',
        bio: response.data.data.bio || '',
        pronouns: response.data.data.pronouns || '',
        location: response.data.data.location || '',
        is_profile_public: response.data.data.is_profile_public || false,
      });
      fetchNotificationPrefs();
    } catch (err: any) {
      showToast('Unable to load profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const response = await api.updateMyProfile(editData);
      setProfile(response.data.data);
      setEditMode(false);
      showToast('Profile updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Unable to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (profile) {
      setEditData({
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        pronouns: profile.pronouns || '',
        location: profile.location || '',
        is_profile_public: profile.is_profile_public || false,
      });
    }
    setEditMode(false);
  };

  const openChangePassword = () => {
    setPasswordData({
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
    setChangePasswordMode(true);
  };

  const handleCancelPasswordChange = () => {
    setChangePasswordMode(false);
    setPasswordData({
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
  };

  const handleChangePassword = async () => {
    if (!passwordData.current_password) {
      showToast('Please enter your current password', 'error');
      return;
    }

    if (!passwordData.new_password) {
      showToast('Please enter a new password', 'error');
      return;
    }

    if (passwordData.new_password !== passwordData.confirm_password) {
      showToast('New passwords do not match', 'error');
      return;
    }

    if (passwordData.new_password.length < 8) {
      showToast('New password must be at least 8 characters long', 'error');
      return;
    }

    if (passwordData.current_password === passwordData.new_password) {
      showToast('New password must be different from current password', 'error');
      return;
    }

    try {
      setPasswordSaving(true);
      await api.changePassword(passwordData.current_password, passwordData.new_password);
      showToast('Password changed successfully!', 'success');
      setChangePasswordMode(false);
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Current password is incorrect', 'error');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleRequestEmailChange = async () => {
    try {
      setEmailChangeSaving(true);
      const response = await api.requestEmailChange(emailChangeData.new_email, emailChangeData.current_password);
      const pendingEmail = response.data.data.pending_email;

      if (profile) {
        setProfile({ ...profile, pending_email: pendingEmail });
      }
      setEmailChangeMode(false);
      setEmailChangeData({ new_email: '', current_password: '' });
      showToast(`Verification email sent to ${pendingEmail}.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to request email change', 'error');
    } finally {
      setEmailChangeSaving(false);
    }
  };

  const handleCancelEmailChange = () => {
    setEmailChangeMode(false);
    setEmailChangeData({ new_email: '', current_password: '' });
  };

  const handleResendEmailChange = async () => {
    try {
      setResendSaving(true);
      const response = await api.resendEmailChangeVerification();
      const pendingEmail = response.data.data.pending_email;
      if (profile) {
        setProfile({ ...profile, pending_email: pendingEmail });
      }
      showToast(`Verification email resent to ${pendingEmail}.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to resend verification email', 'error');
    } finally {
      setResendSaving(false);
    }
  };

  const handleRequestPhoneVerification = async () => {
    if (!isPhoneNumberPlausible(phoneNumberInput)) {
      showToast('Please enter a valid phone number', 'error');
      return;
    }

    try {
      setPhoneRequestSaving(true);
      const response = await api.requestPhoneVerification(phoneNumberInput);
      const { phone_number: normalizedPhone, phone_verified } = response.data.data;

      if (profile) {
        setProfile({ ...profile, phone_number: normalizedPhone, phone_verified });
      }
      setPhoneChangeMode(false);
      setPhoneNumberInput('');
      setPhoneOtpInput('');
      showToast(`Verification code sent to ${maskPhoneNumber(normalizedPhone)}.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to request phone verification', 'error');
    } finally {
      setPhoneRequestSaving(false);
    }
  };

  const handleCancelPhoneChange = () => {
    setPhoneChangeMode(false);
    setPhoneNumberInput('');
  };

  const handleVerifyPhone = async () => {
    try {
      setPhoneVerifySaving(true);
      const response = await api.verifyPhone(phoneOtpInput);
      if (profile) {
        setProfile({ ...profile, phone_verified: response.data.data.phone_verified });
      }
      setPhoneOtpInput('');
      showToast('Phone number verified successfully!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to verify phone number', 'error');
    } finally {
      setPhoneVerifySaving(false);
    }
  };

  const handleResendPhoneVerification = async () => {
    try {
      setPhoneResendSaving(true);
      const response = await api.resendPhoneVerification();
      const phoneNumber = response.data.data.phone_number;
      if (profile) {
        setProfile({ ...profile, phone_number: phoneNumber });
      }
      showToast(`Verification code resent to ${maskPhoneNumber(phoneNumber)}.`, 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to resend verification code', 'error');
    } finally {
      setPhoneResendSaving(false);
    }
  };

  // Avatar Modal Handlers
  const openAvatarModal = (tab: 'upload' | 'preset' = 'upload') => {
    setAvatarModalTab(tab);
    setShowAvatarModal(true);
  };

  const closeAvatarModal = () => {
    setShowAvatarModal(false);
    setCropImageSrc(null);
    setCropZoom(1);
    setCropPan({ x: 0, y: 0 });
    setIsDragging(false);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const handleAvatarSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Only JPG, PNG, and WebP images are supported', 'error');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('File size must be less than 5MB', 'error');
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropZoom(1);
      setCropPan({ x: 0, y: 0 });
      setAvatarModalTab('upload');
      setShowAvatarModal(true);
    };
    reader.readAsDataURL(file);
  };

  // Pan / Drag Pointer Event Handlers for Crop Modal
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!cropImageSrc) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragStart({ x: e.clientX - cropPan.x, y: e.clientY - cropPan.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !cropImageRef.current) return;
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    const img = cropImageRef.current;
    if (img.naturalWidth && img.naturalHeight) {
      const bounds = calculateCropBounds(
        { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight },
        192,
        { zoom: cropZoom, pan: { x: newX, y: newY } }
      );
      setCropPan({ x: bounds.clampedPanX, y: bounds.clampedPanY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const handleCropAndUpload = async () => {
    if (!cropImageRef.current) return;

    try {
      setAvatarUploading(true);

      const canvas = document.createElement('canvas');
      const targetSize = 256;
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        showToast('Unable to process image canvas', 'error');
        setAvatarUploading(false);
        return;
      }

      const img = cropImageRef.current;
      const bounds = calculateCropBounds(
        { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight },
        192,
        { zoom: cropZoom, pan: cropPan }
      );

      ctx.drawImage(
        img,
        bounds.srcX,
        bounds.srcY,
        bounds.srcW,
        bounds.srcH,
        0,
        0,
        targetSize,
        targetSize
      );

      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            showToast('Unable to process cropped avatar blob', 'error');
            setAvatarUploading(false);
            return;
          }

          const fileToUpload = new File([blob], 'avatar.png', { type: 'image/png' });
          const formData = new FormData();
          formData.append('file', fileToUpload);

          try {
            const response = await api.uploadAvatar(formData);
            const avatarData = response.data.data;

            if (profile) {
              setProfile({
                ...profile,
                avatar_key: avatarData.avatar_key,
                avatar_url: avatarData.avatar_url,
              });
            }

            // Update global auth state for header
            updateUser({
              avatar_url: avatarData.avatar_url,
              avatar_key: avatarData.avatar_key,
            });

            closeAvatarModal();
            showToast('Avatar updated successfully!', 'success');
          } catch (err: any) {
            showToast(err.response?.data?.error || 'Unable to upload avatar', 'error');
          } finally {
            setAvatarUploading(false);
          }
        },
        'image/png',
        0.95
      );
    } catch (err: any) {
      showToast('Failed to crop and upload avatar', 'error');
      setAvatarUploading(false);
    }
  };

  const handleSavePresetAvatar = async (preset: AvatarPreset) => {
    try {
      setAvatarUploading(true);

      const response = await api.setPresetAvatar(preset.id);
      const avatarData = response.data.data;

      if (profile) {
        setProfile({
          ...profile,
          avatar_key: avatarData.avatar_key,
          avatar_url: avatarData.avatar_url,
        });
      }

      updateUser({
        avatar_url: avatarData.avatar_url,
        avatar_key: avatarData.avatar_key,
      });

      closeAvatarModal();
      showToast('Avatar updated successfully!', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Unable to save avatar preset', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarDelete = async () => {
    try {
      setAvatarUploading(true);
      await api.deleteAvatar();

      if (profile) {
        setProfile({
          ...profile,
          avatar_key: null,
          avatar_url: null,
        });
      }

      updateUser({
        avatar_url: undefined,
        avatar_key: undefined,
      });

      showToast('Avatar removed', 'success');
    } catch (err: any) {
      showToast('Unable to remove avatar', 'error');
    } finally {
      setAvatarUploading(false);
    }
  };

  const filteredPresets = AVATAR_PRESETS.filter(
    (p) => presetCategory === 'all' || p.category === presetCategory
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex flex-col items-center justify-center min-h-[400px]">
        <div className="spinner w-8 h-8 text-blue-600 mb-3" />
        <p className="text-gray-500 font-medium">Loading profile...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center justify-between border border-red-100 shadow-sm">
          <span>Failed to load profile</span>
          <button onClick={fetchProfile} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 font-medium transition">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Global Floating Toast Stack */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl shadow-lg border text-sm font-medium ${
                toast.type === 'success'
                  ? 'bg-emerald-900 text-white border-emerald-800'
                  : toast.type === 'error'
                  ? 'bg-red-900 text-white border-red-800'
                  : toast.type === 'warning'
                  ? 'bg-amber-900 text-white border-amber-800'
                  : 'bg-gray-900 text-white border-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span>
                  {toast.type === 'success' && '✓'}
                  {toast.type === 'error' && '✕'}
                  {toast.type === 'warning' && '⚠️'}
                  {toast.type === 'info' && 'ℹ️'}
                </span>
                <span>{toast.message}</span>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="ml-4 text-white/70 hover:text-white text-xs font-bold p-1"
                aria-label="Dismiss toast"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Hero Profile Identity Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="pro-card overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative" />

        <div className="px-6 pb-6 pt-0 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 -mt-16 mb-4">
            {/* Avatar with Hover Change Overlay */}
            <div className="relative group">
              <div className="w-28 h-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-white">
                <Avatar
                  src={profile.avatar_url || undefined}
                  name={profile.full_name}
                  size="xl"
                  className="w-full h-full text-2xl"
                />
              </div>

              <button
                type="button"
                onClick={() => openAvatarModal('upload')}
                className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium cursor-pointer"
                title="Change Avatar"
                aria-label="Change Avatar"
              >
                <span>📷</span>
                <span>Change</span>
              </button>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarSelect}
                className="hidden"
                disabled={avatarUploading}
                aria-label="Upload Avatar Input"
              />
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="flex items-center justify-center sm:justify-start gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{profile.full_name}</h1>
                {profile.is_verified && <StatusBadge status="Verified" />}
                <span className="badge badge-blue text-xs uppercase tracking-wide font-semibold">{profile.role}</span>
              </div>
              <p className="text-gray-500 font-medium">@{profile.username}</p>
              {profile.bio && <p className="text-sm text-gray-600 max-w-xl">{profile.bio}</p>}

              <div className="flex items-center justify-center sm:justify-start gap-4 pt-2 text-xs text-gray-500 flex-wrap">
                {profile.location && <span>📍 {profile.location}</span>}
                {profile.pronouns && <span>💬 {profile.pronouns}</span>}
                <span>📅 Joined {new Date(profile.created_at).toLocaleDateString()}</span>
              </div>

              <div className="pt-2 flex gap-3 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => openAvatarModal('upload')}
                  disabled={avatarUploading}
                  className="btn-secondary text-xs font-semibold"
                >
                  📷 Upload Photo
                </button>
                <button
                  type="button"
                  onClick={() => openAvatarModal('preset')}
                  disabled={avatarUploading}
                  className="btn-secondary text-xs font-semibold"
                >
                  🎨 Choose Avatar
                </button>
                {profile.avatar_url && (
                  <button
                    type="button"
                    onClick={handleAvatarDelete}
                    disabled={avatarUploading}
                    className="btn-secondary text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
            </div>

            {!editMode ? (
              <button onClick={() => setEditMode(true)} className="btn-secondary text-xs font-semibold self-center sm:self-end">
                ✏️ Edit Profile
              </button>
            ) : (
              <div className="flex gap-2 self-center sm:self-end">
                <button onClick={handleCancel} disabled={saving} className="btn-secondary text-xs">
                  Cancel
                </button>
                <button onClick={handleSaveProfile} disabled={saving} className="btn-primary text-xs flex items-center gap-2">
                  {saving && <span className="spinner w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Profile Form / View Sections */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="pro-card p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">Personal Information</h2>

        {editMode ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                id="full_name"
                type="text"
                value={editData.full_name}
                onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="pronouns" className="block text-sm font-medium text-gray-700 mb-1">
                Pronouns
              </label>
              <input
                id="pronouns"
                type="text"
                placeholder="e.g. they/them"
                value={editData.pronouns}
                onChange={(e) => setEditData({ ...editData, pronouns: e.target.value })}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                id="location"
                type="text"
                placeholder="e.g. San Francisco, CA"
                value={editData.location}
                onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              <textarea
                id="bio"
                rows={3}
                value={editData.bio}
                onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                className="input-field"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <p className="text-gray-900 font-medium">{profile.full_name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <p className="text-gray-900 font-medium">@{profile.username}</p>
            </div>
            <div>
              <label htmlFor="pronouns" className="block text-sm font-medium text-gray-700 mb-1">Pronouns</label>
              <p className="text-gray-900">{profile.pronouns || 'Not specified'}</p>
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <p className="text-gray-900">{profile.location || 'Not specified'}</p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <p className="text-gray-900">{profile.bio || 'No bio provided'}</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* Contact & Verification Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="pro-card p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">Contact & Verification</h2>

        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              {!emailChangeMode && (
                <button onClick={() => setEmailChangeMode(true)} className="text-xs text-blue-600 font-semibold hover:underline">
                  Change email
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-900 font-medium">{profile.email}</span>
              {profile.is_verified ? (
                <StatusBadge status="Verified" />
              ) : (
                <span className="badge badge-yellow text-xs">Unverified</span>
              )}
            </div>

            {profile.pending_email && (
              <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                <div>
                  Pending verification for: <strong>{profile.pending_email}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleResendEmailChange}
                  disabled={resendSaving}
                  className="btn-secondary text-[11px] py-1 px-2"
                >
                  {resendSaving ? 'Resending...' : 'Resend Email'}
                </button>
              </div>
            )}

            {emailChangeMode && (
              <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3 max-w-md">
                <div>
                  <label htmlFor="new_email" className="block text-xs font-medium text-gray-700 mb-1">
                    New Email Address
                  </label>
                  <input
                    id="new_email"
                    type="email"
                    value={emailChangeData.new_email}
                    onChange={(e) => setEmailChangeData({ ...emailChangeData, new_email: e.target.value })}
                    className="input-field text-sm"
                    placeholder="newemail@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="confirm_password_email" className="block text-xs font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    id="confirm_password_email"
                    type="password"
                    value={emailChangeData.current_password}
                    onChange={(e) => setEmailChangeData({ ...emailChangeData, current_password: e.target.value })}
                    className="input-field text-sm"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button type="button" onClick={handleCancelEmailChange} className="btn-secondary text-xs py-1.5">
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestEmailChange}
                    disabled={emailChangeSaving}
                    className="btn-primary text-xs py-1.5 flex items-center gap-1.5"
                  >
                    {emailChangeSaving && <span className="spinner w-3.5 h-3.5" />}
                    Request Change
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-gray-700">Phone Verification</label>
              {!phoneChangeMode && (
                <button onClick={() => setPhoneChangeMode(true)} className="text-xs text-blue-600 font-semibold hover:underline">
                  {profile.phone_number ? 'Update phone' : 'Add phone'}
                </button>
              )}
            </div>

            {profile.phone_number ? (
              <div className="flex items-center gap-3">
                <span className="text-gray-900 font-medium">{maskPhoneNumber(profile.phone_number)}</span>
                {profile.phone_verified ? (
                  <StatusBadge status="Verified" />
                ) : (
                  <span className="badge badge-yellow text-xs">Unverified</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No phone number added for two-factor verification.</p>
            )}

            {phoneChangeMode && (
              <div className="mt-3 space-y-3 max-w-md">
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={phoneNumberInput}
                    onChange={(e) => setPhoneNumberInput(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="input-field"
                  />
                  <button
                    type="button"
                    onClick={handleRequestPhoneVerification}
                    disabled={phoneRequestSaving || !phoneNumberInput}
                    className="btn-primary text-xs flex-shrink-0"
                  >
                    {phoneRequestSaving ? 'Sending...' : 'Send OTP'}
                  </button>
                </div>

                <div className="flex justify-end">
                  <button type="button" onClick={handleCancelPhoneChange} className="text-xs text-gray-500 hover:underline">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {profile.phone_number && !profile.phone_verified && (
              <div className="mt-3 p-3 bg-blue-50 rounded-xl border border-blue-100 space-y-2">
                <p className="text-xs text-blue-900 font-medium">Enter 6-digit OTP code sent to your phone:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    value={phoneOtpInput}
                    onChange={(e) => setPhoneOtpInput(e.target.value)}
                    placeholder="123456"
                    className="input-field text-center font-mono tracking-widest text-sm w-36"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyPhone}
                    disabled={phoneVerifySaving || phoneOtpInput.length !== 6}
                    className="btn-primary text-xs"
                  >
                    {phoneVerifySaving ? 'Verifying...' : 'Verify OTP'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResendPhoneVerification}
                    disabled={phoneResendSaving}
                    className="btn-secondary text-xs"
                  >
                    Resend
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Security & Password Section */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="pro-card p-6">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Security & Password</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage your account password and security options</p>
          </div>
          {!changePasswordMode && (
            <button onClick={openChangePassword} className="btn-secondary text-xs font-semibold">
              🔑 Change Password
            </button>
          )}
        </div>

        {changePasswordMode ? (
          <form
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              handleChangePassword();
            }}
            className="space-y-4 max-w-md pt-2"
          >
            {/* Dummy hidden inputs to intercept browser autofill */}
            <input type="text" className="hidden" aria-hidden="true" tabIndex={-1} autoComplete="username" />
            <input type="password" className="hidden" aria-hidden="true" tabIndex={-1} autoComplete="current-password" />

            <div>
              <label htmlFor="current_password" className="block text-sm font-medium text-gray-700 mb-1">
                Current Password <span className="text-red-500">*</span>
              </label>
              <input
                id="current_password"
                name="current_password_security_field"
                type="password"
                autoComplete="off"
                value={passwordData.current_password}
                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                className="input-field"
              />
            </div>

            <div>
              <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password <span className="text-red-500">*</span>
              </label>
              <input
                id="new_password"
                name="new_password_security_field"
                type="password"
                autoComplete="new-password"
                value={passwordData.new_password}
                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                className="input-field"
              />
              <p className="text-[11px] text-gray-500 mt-1">Must be at least 8 characters long</p>
            </div>

            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <input
                id="confirm_password"
                name="confirm_password_security_field"
                type="password"
                autoComplete="new-password"
                value={passwordData.confirm_password}
                onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                className="input-field"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={handleCancelPasswordChange} disabled={passwordSaving} className="btn-secondary flex-1 text-xs">
                Cancel
              </button>
              <button type="submit" disabled={passwordSaving} className="btn-primary flex-1 text-xs flex items-center justify-center gap-2">
                {passwordSaving && <span className="spinner w-3.5 h-3.5" />}
                Update Password
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Password was last updated in accordance with security policies.</span>
          </div>
        )}
      </motion.div>

      {/* Notification Settings Card with 8 Expandable Category Accordions */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="pro-card p-6 space-y-4" data-testid="notification-preferences-settings">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Notification Preferences</h2>
            <p className="text-xs text-gray-500 mt-0.5">Control which event notifications you receive across product workflows</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
            8 Categories
          </span>
        </div>

        <div className="space-y-3">
          {[
            {
              id: 'WORK & ASSIGNMENTS',
              icon: '📋',
              desc: 'Notifications for tasks assigned directly to you or your team',
              items: [
                { key: 'task_assignment', label: 'Task Assignments', desc: 'When a task is assigned to you or your team' },
              ],
            },
            {
              id: 'REVIEWS & APPROVALS',
              icon: '🔎',
              desc: 'Notifications for task submissions, approvals, and review feedback',
              items: [
                { key: 'task_review', label: 'Task Reviews & Approvals', desc: 'When your task is reviewed, approved, or returned for changes' },
              ],
            },
            {
              id: 'GOALS',
              icon: '🎯',
              desc: 'Notifications for goal proposals, progress sign-offs, and completion',
              items: [
                { key: 'goal_creation', label: 'Goal Creation Proposals', desc: 'When a team goal creation is proposed or approved' },
                { key: 'goal_review', label: 'Goal Progress Reviews', desc: 'When goal progress is reviewed or updated' },
                { key: 'goal_completion', label: 'Goal Completion Approvals', desc: 'When goal completion is submitted or approved' },
              ],
            },
            {
              id: 'BLOCKERS & ATTENTION',
              icon: '🚨',
              desc: 'Notifications for blockers, SOS requests, and attention escalations',
              items: [
                { key: 'blocker', label: 'Blockers & SOS Alerts', desc: 'When a blocker is created or updated in your team' },
              ],
            },
            {
              id: 'GUIDANCE',
              icon: '💡',
              desc: 'Leadership guidance and direction notifications',
              items: [
                { key: 'guidance', label: 'Guidance Received', desc: 'When actionable leadership guidance is issued to you' },
              ],
            },
            {
              id: 'TEAMS & CLASSROOM',
              icon: '👥',
              desc: 'Team join requests, invites, and classroom updates',
              items: [
                { key: 'team_join_request', label: 'Team Join Requests', desc: 'When someone requests to join your team' },
              ],
            },
            {
              id: 'CHAT',
              icon: '💬',
              desc: 'Direct messages and team channel chat notifications',
              items: [
                { key: 'chat_message', label: 'Chat Messages', desc: 'When a direct or team chat message is sent to you' },
              ],
            },
            {
              id: 'SECURITY',
              icon: '🔒',
              desc: 'Critical account security and verification alerts (Always Active)',
              items: [
                { key: 'password_change', label: 'Password Change Alerts', desc: 'Security alert sent when password is updated', readOnly: true },
                { key: 'email_change', label: 'Email Change Alerts', desc: 'Security alert sent when email change is requested or verified', readOnly: true },
                { key: 'phone_verification', label: 'Phone Verification Alerts', desc: 'Notification sent when phone is verified', readOnly: true },
              ],
            },
          ].map((cat) => {
            const isExpanded = expandedPrefCat === cat.id;
            return (
              <div key={cat.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setExpandedPrefCat(isExpanded ? null : cat.id)}
                  className="w-full p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{cat.icon}</span>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">{cat.id}</h3>
                      <p className="text-xs text-gray-500">{cat.desc}</p>
                    </div>
                  </div>
                  <span className="text-gray-400 font-bold text-xs">
                    {isExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="p-4 bg-slate-50/50 border-t border-gray-100 space-y-3">
                    {cat.items.map((item: any) => {
                      const enabled = item.readOnly ? true : (notificationPrefs[item.key] ?? true);
                      return (
                        <div key={item.key} className="flex items-center justify-between gap-4">
                          <div className="space-y-0.5 min-w-0">
                            <label className="text-xs font-bold text-gray-900 block">{item.label}</label>
                            <p className="text-[11px] text-gray-500">{item.desc}</p>
                          </div>
                          {item.readOnly ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              ACTIVE (SECURITY)
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(e) => handleTogglePref(item.key, e.target.checked)}
                              className="w-4 h-4 text-indigo-600 rounded cursor-pointer accent-indigo-600"
                              data-testid={`toggle-pref-${item.key}`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Privacy Settings Card */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="pro-card p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">Privacy & Visibility</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Teammate Profile Visibility</p>
            <p className="text-xs text-gray-500 mt-0.5">Allow teammates in shared teams to view your bio and status</p>
          </div>
          <input
            type="checkbox"
            checked={profile.is_profile_public}
            onChange={async (e) => {
              const newValue = e.target.checked;
              try {
                const res = await api.updateMyProfile({ is_profile_public: newValue });
                setProfile(res.data.data);
                showToast('Privacy settings updated', 'success');
              } catch {
                showToast('Failed to update privacy settings', 'error');
              }
            }}
            className="w-5 h-5 text-blue-600 rounded cursor-pointer disabled:opacity-50"
            disabled={saving}
          />
        </div>
      </motion.div>

      {/* Unified Avatar Modal (Crop & Pan + Preset Gallery) */}
      <AnimatePresence>
        {showAvatarModal && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeAvatarModal();
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="avatar-modal-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pro-card p-6 w-full max-w-lg bg-white rounded-2xl relative flex flex-col max-h-[90vh] overflow-y-auto"
            >
              {/* Sticky Close [X] */}
              <button
                type="button"
                onClick={closeAvatarModal}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-lg font-bold p-1 rounded-full hover:bg-gray-100 transition"
                aria-label="Close modal"
              >
                ✕
              </button>

              <h2 id="avatar-modal-title" className="text-xl font-bold text-gray-900 mb-1">
                Change Avatar
              </h2>
              <p className="text-xs text-gray-500 mb-4">Select an avatar or upload a custom photo for CommandCenter</p>

              {/* Tab Selector */}
              <div className="flex border-b border-gray-200 mb-5 w-full">
                <button
                  type="button"
                  onClick={() => setAvatarModalTab('upload')}
                  className={`pb-2 px-4 text-sm font-semibold border-b-2 transition ${
                    avatarModalTab === 'upload' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📷 Upload Photo
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarModalTab('preset')}
                  className={`pb-2 px-4 text-sm font-semibold border-b-2 transition ${
                    avatarModalTab === 'preset' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🎨 Choose Avatar
                </button>
              </div>

              {/* TAB 1: UPLOAD & CROP PAN EDITOR */}
              {avatarModalTab === 'upload' && (
                <div className="flex flex-col items-center w-full space-y-4">
                  {!cropImageSrc ? (
                    <div className="w-full p-8 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center space-y-3 bg-gray-50 hover:bg-gray-100/80 transition">
                      <span className="text-3xl">📷</span>
                      <p className="text-sm font-medium text-gray-700">Choose an image from your device</p>
                      <p className="text-xs text-gray-400">JPG, PNG, or WebP (max 5MB)</p>
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        className="btn-primary text-xs px-4 py-2"
                      >
                        Select Image
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Draggable Circular Crop Preview Viewport */}
                      {(() => {
                        const img = cropImageRef.current;
                        const bounds = img && img.naturalWidth && img.naturalHeight
                          ? calculateCropBounds(
                              { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight },
                              192,
                              { zoom: cropZoom, pan: cropPan }
                            )
                          : null;

                        return (
                          <div
                            className="w-48 h-48 rounded-full overflow-hidden border-4 border-blue-500 shadow-xl relative bg-gray-900 cursor-grab active:cursor-grabbing touch-none select-none"
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                          >
                            <img
                              ref={cropImageRef}
                              src={cropImageSrc}
                              alt="Crop preview"
                              draggable={false}
                              onLoad={() => {
                                // Force re-render once natural dimensions are loaded
                                setCropPan((prev) => ({ ...prev }));
                              }}
                              style={{
                                position: 'absolute',
                                left: bounds ? `${bounds.baseLeft}px` : '0px',
                                top: bounds ? `${bounds.baseTop}px` : '0px',
                                width: bounds ? `${bounds.renderedWidth}px` : '100%',
                                height: bounds ? `${bounds.renderedHeight}px` : '100%',
                                transform: bounds
                                  ? `translate(${bounds.clampedPanX}px, ${bounds.clampedPanY}px) scale(${cropZoom})`
                                  : `scale(${cropZoom})`,
                                transformOrigin: 'center center',
                                maxWidth: 'none',
                                maxHeight: 'none',
                                pointerEvents: 'none',
                              }}
                            />
                          </div>
                        );
                      })()}

                      <p className="text-[11px] text-gray-500 flex items-center gap-1 font-medium">
                        <span>💡</span>
                        <span>Drag to reposition face inside circle</span>
                      </p>

                      {/* Zoom Slider */}
                      <div className="w-full space-y-1 px-4">
                        <div className="flex justify-between text-xs text-gray-500 font-medium">
                          <span>Zoom</span>
                          <span>{cropZoom.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="3"
                          step="0.1"
                          value={cropZoom}
                          onChange={(e) => setCropZoom(parseFloat(e.target.value))}
                          className="w-full accent-blue-600 cursor-pointer"
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3 w-full pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCropImageSrc(null);
                            if (avatarInputRef.current) avatarInputRef.current.value = '';
                          }}
                          disabled={avatarUploading}
                          className="btn-secondary flex-1 text-xs"
                        >
                          Choose Different
                        </button>
                        <button
                          type="button"
                          onClick={handleCropAndUpload}
                          disabled={avatarUploading}
                          className="btn-primary flex-1 text-xs flex items-center justify-center gap-2"
                        >
                          {avatarUploading && <span className="spinner w-3.5 h-3.5" />}
                          Save & Upload
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: PRESET GALLERY */}
              {avatarModalTab === 'preset' && (
                <div className="flex flex-col space-y-4 w-full">
                  {/* Category Filter Pills */}
                  <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-semibold">
                    {(['all', 'people', 'animals', 'simple'] as const).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setPresetCategory(cat)}
                        className={`px-3 py-1.5 rounded-full capitalize transition ${
                          presetCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Presets Grid */}
                  <div className="grid grid-cols-4 gap-3 max-h-56 overflow-y-auto p-1">
                    {filteredPresets.map((preset) => {
                      const isSelected = selectedPreset?.id === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => setSelectedPreset(preset)}
                          aria-label={`Select ${preset.name} avatar`}
                          className={`flex flex-col items-center p-2 rounded-xl border transition group ${
                            isSelected ? 'border-blue-600 bg-blue-50/80 ring-2 ring-blue-500/30' : 'border-gray-200 hover:border-blue-300 bg-white'
                          }`}
                        >
                          <div className="w-12 h-12 rounded-full overflow-hidden mb-1 shadow-sm group-hover:scale-105 transition-transform">
                            <img src={preset.svgDataUri} alt={preset.name} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[10px] text-gray-600 font-medium truncate w-full text-center">{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Preset Live Circle Preview */}
                  {selectedPreset && (
                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between mt-2">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-blue-500 shadow-sm">
                          <img src={selectedPreset.svgDataUri} alt={selectedPreset.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{selectedPreset.name}</p>
                          <p className="text-[10px] text-gray-500 capitalize">{selectedPreset.category} Avatar</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSavePresetAvatar(selectedPreset)}
                        disabled={avatarUploading}
                        className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
                      >
                        {avatarUploading && <span className="spinner w-3.5 h-3.5" />}
                        Save Avatar
                      </button>
                    </div>
                  )}

                  {/* Footer Actions */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                    <button type="button" onClick={closeAvatarModal} disabled={avatarUploading} className="btn-secondary text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
