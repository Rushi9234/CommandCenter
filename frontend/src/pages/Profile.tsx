import { useState, useEffect } from 'react';
import * as api from '../services/api';
import { motion } from 'framer-motion';

interface ProfileData {
  user_id: string;
  email: string;
  username: string;
  full_name: string;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  is_profile_public: boolean;
  role: string;
  created_at: string;
  updated_at: string;
}

export default function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    full_name: '',
    bio: '',
    pronouns: '',
    location: '',
    is_profile_public: false,
  });

  const [changePasswordMode, setChangePasswordMode] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await api.getMyProfile();
      const data = response.data;
      setProfile(data);
      setEditData({
        full_name: data.full_name || '',
        bio: data.bio || '',
        pronouns: data.pronouns || '',
        location: data.location || '',
        is_profile_public: data.is_profile_public || false,
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSaveSuccess(false);

      const updates: Record<string, any> = {};
      if (editData.full_name !== profile?.full_name) updates.full_name = editData.full_name;
      if (editData.bio !== profile?.bio) updates.bio = editData.bio || null;
      if (editData.pronouns !== profile?.pronouns) updates.pronouns = editData.pronouns || null;
      if (editData.location !== profile?.location) updates.location = editData.location || null;
      if (editData.is_profile_public !== profile?.is_profile_public) updates.is_profile_public = editData.is_profile_public;

      if (Object.keys(updates).length === 0) {
        setEditMode(false);
        return;
      }

      const response = await api.updateMyProfile(updates);
      setProfile(response.data);
      setEditMode(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile');
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

  const handleChangePassword = async () => {
    if (passwordData.new_password !== passwordData.confirm_password) {
      setError('New passwords do not match');
      return;
    }

    if (passwordData.new_password.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    try {
      setPasswordSaving(true);
      setError('');
      setPasswordSuccess(false);

      await api.changePassword(passwordData.current_password, passwordData.new_password);

      setPasswordSuccess(true);
      setChangePasswordMode(false);
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });

      // Clear success message after 3 seconds
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setChangePasswordMode(false);
    setPasswordData({
      current_password: '',
      new_password: '',
      confirm_password: '',
    });
    setError('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading profile...</div>
      </div>
    );
  }

  if (!profile && error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 lg:p-8"
      >
        <div className="max-w-2xl mx-auto flex items-center justify-center h-screen">
          <div className="pro-card p-6">
            <p className="text-sm text-red-700 mb-4">{error}</p>
            <button
              onClick={loadProfile}
              className="text-sm text-red-600 hover:text-red-700 font-medium underline"
            >
              Retry
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Unable to load profile</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4 lg:p-8"
    >
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">My Profile</h1>
          <p className="text-gray-600">Manage your profile information and settings</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={loadProfile}
              className="mt-2 text-sm text-red-600 hover:text-red-700 font-medium underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Success */}
        {(saveSuccess || passwordSuccess) && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700">
              {passwordSuccess ? 'Password changed successfully!' : 'Profile updated successfully!'}
            </p>
          </div>
        )}

        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="pro-card shadow-lg overflow-hidden"
        >
          {/* Avatar Section */}
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-6 py-8 flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-2xl font-bold text-indigo-600">
              {profile.full_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="text-white">
              <h2 className="text-xl font-semibold">{profile.full_name}</h2>
              <p className="text-blue-100">@{profile.username}</p>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Basic Information</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <div className="text-gray-900">{profile.email}</div>
                <p className="text-xs text-gray-500 mt-1">Email changes coming in a future phase</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Username
                </label>
                <div className="text-gray-900">@{profile.username}</div>
              </div>

              <div>
                <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                {editMode ? (
                  <input
                    id="full_name"
                    type="text"
                    value={editData.full_name}
                    onChange={(e) => setEditData({ ...editData, full_name: e.target.value })}
                    className="input-field"
                    maxLength={255}
                  />
                ) : (
                  <div className="text-gray-900">{profile.full_name}</div>
                )}
              </div>

              <div>
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-2">
                  Bio
                </label>
                {editMode ? (
                  <textarea
                    id="bio"
                    value={editData.bio}
                    onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                    className="input-field h-20 resize-none"
                    maxLength={500}
                    placeholder="Tell us about yourself..."
                  />
                ) : (
                  <div className="text-gray-900 min-h-6">
                    {profile.bio ? profile.bio : <span className="text-gray-400 italic">No bio</span>}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pronouns" className="block text-sm font-medium text-gray-700 mb-2">
                    Pronouns
                  </label>
                  {editMode ? (
                    <input
                      id="pronouns"
                      type="text"
                      value={editData.pronouns}
                      onChange={(e) => setEditData({ ...editData, pronouns: e.target.value })}
                      className="input-field"
                      placeholder="e.g., they/them"
                      maxLength={50}
                    />
                  ) : (
                    <div className="text-gray-900 min-h-6">
                      {profile.pronouns ? profile.pronouns : <span className="text-gray-400 italic">Not set</span>}
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-2">
                    Location
                  </label>
                  {editMode ? (
                    <input
                      id="location"
                      type="text"
                      value={editData.location}
                      onChange={(e) => setEditData({ ...editData, location: e.target.value })}
                      className="input-field"
                      placeholder="e.g., San Francisco, CA"
                      maxLength={100}
                    />
                  ) : (
                    <div className="text-gray-900 min-h-6">
                      {profile.location ? profile.location : <span className="text-gray-400 italic">Not set</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-4 border-t pt-6">
              <h3 className="font-semibold text-gray-900">Privacy & Visibility</h3>

              <div className="flex items-center space-x-3">
                <input
                  id="is_profile_public"
                  type="checkbox"
                  checked={editMode ? editData.is_profile_public : profile.is_profile_public}
                  onChange={(e) =>
                    editMode && setEditData({ ...editData, is_profile_public: e.target.checked })
                  }
                  disabled={!editMode}
                  className="w-4 h-4 rounded cursor-pointer"
                />
                <label htmlFor="is_profile_public" className="text-sm text-gray-700">
                  Make my profile visible to teammates
                </label>
              </div>

              {editMode && (
                <p className="text-xs text-gray-500">
                  When enabled, teammates can view your profile information.
                </p>
              )}
            </div>

            {/* Account Info */}
            <div className="space-y-3 border-t pt-6">
              <h3 className="font-semibold text-gray-900">Account</h3>

              <div className="text-sm text-gray-600">
                <p>
                  <span className="font-medium">Role:</span> {profile.role}
                </p>
                <p>
                  <span className="font-medium">Member since:</span>{' '}
                  {new Date(profile.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Security */}
            <div className="space-y-3 border-t pt-6">
              <h3 className="font-semibold text-gray-900">Security</h3>

              {changePasswordMode ? (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="current_password" className="block text-sm font-medium text-gray-700 mb-2">
                      Current Password
                    </label>
                    <input
                      id="current_password"
                      type="password"
                      value={passwordData.current_password}
                      onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                      className="input-field"
                      placeholder="Enter current password"
                    />
                  </div>

                  <div>
                    <label htmlFor="new_password" className="block text-sm font-medium text-gray-700 mb-2">
                      New Password
                    </label>
                    <input
                      id="new_password"
                      type="password"
                      value={passwordData.new_password}
                      onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                      className="input-field"
                      placeholder="Enter new password (min 8 characters)"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm_password" className="block text-sm font-medium text-gray-700 mb-2">
                      Confirm New Password
                    </label>
                    <input
                      id="confirm_password"
                      type="password"
                      value={passwordData.confirm_password}
                      onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                      className="input-field"
                      placeholder="Confirm new password"
                    />
                  </div>

                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={handleCancelPasswordChange}
                      disabled={passwordSaving}
                      className="btn-secondary disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleChangePassword}
                      disabled={passwordSaving}
                      className="btn-primary disabled:opacity-50"
                    >
                      {passwordSaving ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setChangePasswordMode(true)} className="btn-secondary text-sm">
                  Change Password
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="border-t pt-6 flex gap-3 justify-end">
              {editMode ? (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="btn-secondary disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <button onClick={() => setEditMode(true)} className="btn-primary">
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
