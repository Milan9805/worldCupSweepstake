'use client';

import { useState } from 'react';
import NavBar from '@/components/NavBar';
import DragDropAssign from '@/components/DragDropAssign';
import { adminLogin, adminUpdateMembers, adminGetUploadUrl } from '@/lib/api';

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState<'members' | 'assign' | 'avatars'>('members');

  // Member management state
  const [groupKey, setGroupKey] = useState('');
  const [memberName, setMemberName] = useState('');
  const [membersList, setMembersList] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState('');



  // Avatar upload state
  const [avatarGroupKey, setAvatarGroupKey] = useState('');
  const [avatarPerson, setAvatarPerson] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const result = await adminLogin(secret);
      setToken(result.token);
      setSecret('');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  const handleAddMember = () => {
    if (memberName.trim() && !membersList.includes(memberName.trim())) {
      setMembersList([...membersList, memberName.trim()]);
      setMemberName('');
    }
  };

  const handleSaveMembers = async () => {
    if (!token || !groupKey) return;
    try {
      const members = membersList.map((name) => ({
        name,
        imageUrl: null,
        teams: [],
      }));
      await adminUpdateMembers(token, groupKey, members);
      setStatusMessage('Members saved successfully!');
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleAvatarUpload = async () => {
    if (!token || !avatarGroupKey || !avatarPerson || !avatarFile) return;
    try {
      const { uploadUrl, imageUrl } = await adminGetUploadUrl(
        token,
        avatarGroupKey,
        avatarPerson,
        avatarFile.type
      );
      // Upload directly to S3
      await fetch(uploadUrl, {
        method: 'PUT',
        body: avatarFile,
        headers: { 'Content-Type': avatarFile.type },
      });
      setStatusMessage(`Avatar uploaded! URL: ${imageUrl}`);
    } catch (err) {
      setStatusMessage(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen">
        <NavBar />
        <div className="max-w-md mx-auto mt-20 px-4">
          <div className="bg-black/40 backdrop-blur-sm rounded-xl p-6 border border-white/10">
          <h1 className="text-2xl font-bold mb-6 text-center text-white">Admin Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter admin secret..."
              className="w-full px-4 py-3 rounded-lg bg-black/30 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {loginError && <p className="text-red-400 text-sm">{loginError}</p>}
            <button
              type="submit"
              className="w-full py-3 bg-accent hover:bg-accent/80 text-white rounded-lg font-medium"
            >
              Login
            </button>
          </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-black/40 backdrop-blur-sm rounded-xl p-6 border border-white/10">
        <h1 className="text-2xl font-bold mb-6 text-white">Admin Panel</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
          {(['members', 'assign', 'avatars'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                activeTab === tab
                  ? 'bg-accent text-white'
                  : 'bg-white/10 text-white/80 hover:bg-white/20'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {statusMessage && (
          <div className="mb-4 p-3 rounded-lg bg-blue-900/30 border border-blue-500/30 text-sm">
            {statusMessage}
          </div>
        )}

        {/* Members tab */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Manage Group Members</h2>
            <input
              type="text"
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value)}
              placeholder="Group key..."
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Member name..."
                className="flex-1 px-4 py-2 rounded-lg bg-black/30 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent"
                onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
              />
              <button
                onClick={handleAddMember}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {membersList.map((name) => (
                <span
                  key={name}
                  className="px-3 py-1 bg-white/10 rounded-full text-sm flex items-center gap-2"
                >
                  {name}
                  <button
                    onClick={() => setMembersList(membersList.filter((n) => n !== name))}
                    className="text-red-400 hover:text-red-300"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button
              onClick={handleSaveMembers}
              disabled={!groupKey || membersList.length === 0}
              className="px-6 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg"
            >
              Save Members
            </button>
            <button
              onClick={() => { setGroupKey(''); setMemberName(''); setMembersList([]); setStatusMessage(''); }}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Clear
            </button>
          </div>
        )}

        {/* Assign tab */}
        {activeTab === 'assign' && (
          <DragDropAssign token={token} onStatus={setStatusMessage} />
        )}

        {/* Avatars tab */}
        {activeTab === 'avatars' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">Upload Avatar</h2>
            <input
              type="text"
              value={avatarGroupKey}
              onChange={(e) => setAvatarGroupKey(e.target.value)}
              placeholder="Group key..."
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="text"
              value={avatarPerson}
              onChange={(e) => setAvatarPerson(e.target.value)}
              placeholder="Person name..."
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
              className="w-full text-white"
            />
            <button
              onClick={handleAvatarUpload}
              disabled={!avatarGroupKey || !avatarPerson || !avatarFile}
              className="px-6 py-2 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white rounded-lg"
            >
              Upload
            </button>
            <button
              onClick={() => { setAvatarGroupKey(''); setAvatarPerson(''); setAvatarFile(null); setStatusMessage(''); }}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Clear
            </button>
          </div>
        )}


        </div>
      </div>
    </div>
  );
}
