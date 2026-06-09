import { useState, useEffect } from 'react';
import { Users, Trash2, Plus, Save, X, Search, CheckSquare, Square, Edit2 } from 'lucide-react';
import axios from 'axios';

interface Group {
  id: string;
  name: string;
  isGroup: boolean;
}

interface Profile {
  id: number;
  name: string;
  groups: string[];
}

const PostingProfiles = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create / Edit Profile state
  const [isCreating, setIsCreating] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const API = '/api';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profilesRes, groupsRes] = await Promise.all([
        axios.get(`${API}/profiles`),
        axios.get(`${API}/whatsapp/chats`).catch(() => ({ data: [] as Group[] }))
      ]);
      setProfiles(profilesRes.data);
      setGroups(groupsRes.data);
    } catch (e) {
      console.error('Error fetching profiles data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) {
      alert('Please enter a profile name.');
      return;
    }
    if (selectedGroups.length === 0) {
      alert('Please select at least one group.');
      return;
    }

    try {
      if (editingProfileId !== null) {
        const res = await axios.put(`${API}/profiles/${editingProfileId}`, {
          name: profileName.trim(),
          groups: selectedGroups
        });
        setProfiles(prev => prev.map(p => p.id === editingProfileId ? res.data : p));
      } else {
        const res = await axios.post(`${API}/profiles`, {
          name: profileName.trim(),
          groups: selectedGroups
        });
        setProfiles(prev => [...prev, res.data]);
      }
      handleCancel();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save profile');
    }
  };

  const handleStartEdit = (profile: Profile) => {
    setEditingProfileId(profile.id);
    setProfileName(profile.name);
    setSelectedGroups(profile.groups);
    setIsCreating(true);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingProfileId(null);
    setProfileName('');
    setSelectedGroups([]);
  };

  const handleDeleteProfile = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the profile "${name}"?`)) return;

    try {
      await axios.delete(`${API}/profiles/${id}`);
      setProfiles(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      alert('Failed to delete profile.');
    }
  };

  const toggleGroupSelection = (id: string) => {
    setSelectedGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const selectAllFilteredGroups = (filtered: Group[]) => {
    const filteredIds = filtered.map(g => g.id);
    const allSelected = filteredIds.every(id => selectedGroups.includes(id));
    if (allSelected) {
      setSelectedGroups(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedGroups(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Posting Profiles</h2>
          <p className="text-slate-400 text-sm">Create target group lists for easy selection during postings.</p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Plus size={18} /> Add Profile
          </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleSaveProfile} className="glass-card p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
            <h3 className="text-lg font-semibold text-white">
              {editingProfileId !== null ? 'Edit Profile' : 'Create New Profile'}
            </h3>
            <button
              type="button"
              onClick={handleCancel}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Profile Name *</label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="e.g. Committee Groups, Ward Leads"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-slate-300 text-sm font-medium">Select Groups ({selectedGroups.length} selected)</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => selectAllFilteredGroups(filteredGroups)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    Select/Deselect All Filtered
                  </button>
                </div>
              </div>

              {/* Search Groups */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search WhatsApp groups..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-xl max-h-60 overflow-y-auto p-2 space-y-1">
                {filteredGroups.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-4">No groups found. Link WhatsApp status or search another term.</p>
                ) : (
                  filteredGroups.map(g => (
                    <div
                      key={g.id}
                      onClick={() => toggleGroupSelection(g.id)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedGroups.includes(g.id)
                          ? 'bg-indigo-600/20 border border-indigo-500/30'
                          : 'hover:bg-slate-800'
                      }`}
                    >
                      {selectedGroups.includes(g.id) ? (
                        <CheckSquare size={16} className="text-indigo-400" />
                      ) : (
                        <Square size={16} className="text-slate-500" />
                      )}
                      <div>
                        <span className="text-slate-200 text-sm font-medium">{g.name}</span>
                        <span className="text-[10px] text-slate-500 block">{g.id}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-700/50 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
            >
              <Save size={18} /> Save Profile
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : profiles.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="inline-flex p-4 bg-indigo-500/10 rounded-full text-indigo-400">
            <Users size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white">No Profiles Yet</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Create lists of WhatsApp groups so you can broadcast announcements to all of them at once with a single click.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Plus size={16} /> Create First Profile
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profiles.map(p => (
            <div key={p.id} className="glass-card p-5 flex flex-col justify-between space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                  <span className="text-xs text-slate-500 block mt-0.5">
                    {p.groups.length} {p.groups.length === 1 ? 'group' : 'groups'} included
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStartEdit(p)}
                    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors cursor-pointer"
                    title="Edit Profile"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteProfile(p.id, p.name)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors cursor-pointer"
                    title="Delete Profile"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Display group names snippet */}
              <div className="bg-slate-900/30 border border-slate-800/50 rounded-lg p-3 max-h-28 overflow-y-auto space-y-1">
                {p.groups.map(gid => {
                  const grp = groups.find(g => g.id === gid);
                  return (
                    <div key={gid} className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 truncate font-medium max-w-[200px]">
                        {grp ? grp.name : 'Unknown Group'}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate max-w-[120px] font-mono">
                        {gid}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PostingProfiles;
