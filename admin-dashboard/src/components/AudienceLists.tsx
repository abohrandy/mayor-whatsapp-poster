import { useState, useEffect } from 'react';
import { Users, Trash2, Plus, Save, X, Search, CheckSquare, Square, Edit2, List } from 'lucide-react';
import axios from 'axios';

interface Group {
  id: string;
  name: string;
  isGroup: boolean;
}

interface ContactList {
  id: number;
  name: string;
  description: string;
  contact_ids: number[];
}

interface GroupList {
  id: number;
  name: string;
  description: string;
  groups: string[];
}

interface AudienceList {
  id: number;
  name: string;
  description?: string;
  groups: string[];
  contact_list_ids?: number[];
  group_list_ids?: number[];
}

interface AudienceListsProps {
  showGroupsOnly?: boolean;
  onSwitchToCreateAudience?: () => void;
  initialCreateMode?: boolean;
}

const AudienceLists = ({ showGroupsOnly = false, onSwitchToCreateAudience, initialCreateMode = false }: AudienceListsProps) => {
  const [audienceLists, setAudienceLists] = useState<AudienceList[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [groupLists, setGroupLists] = useState<GroupList[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create / Edit Audience List state
  const [isCreating, setIsCreating] = useState(initialCreateMode);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [listName, setListName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedContactListIds, setSelectedContactListIds] = useState<number[]>([]);
  const [selectedGroupListIds, setSelectedGroupListIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const API = '/api';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [listsRes, groupsRes, contactListsRes, groupListsRes] = await Promise.all([
        axios.get(`${API}/audience-lists`).catch(() => axios.get(`${API}/profiles`)),
        axios.get(`${API}/whatsapp/chats`).catch(() => ({ data: [] as Group[] })),
        axios.get(`${API}/contact-lists`).catch(() => ({ data: [] as ContactList[] })),
        axios.get(`${API}/group-lists`).catch(() => ({ data: [] as GroupList[] }))
      ]);
      setAudienceLists(listsRes.data);
      setGroups(groupsRes.data);
      setContactLists(contactListsRes.data);
      setGroupLists(groupListsRes.data);
    } catch (e) {
      console.error('Error fetching audience lists data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listName.trim()) {
      alert('Please enter an audience list name.');
      return;
    }
    if (selectedContactListIds.length === 0 && selectedGroupListIds.length === 0) {
      alert('Please select at least one Contact List or Group List.');
      return;
    }

    try {
      if (editingListId !== null) {
        const res = await axios.put(`${API}/audience-lists/${editingListId}`, {
          name: listName.trim(),
          description: description.trim(),
          groups: selectedGroups,
          contact_list_ids: selectedContactListIds,
          group_list_ids: selectedGroupListIds
        });
        setAudienceLists(prev => prev.map(l => l.id === editingListId ? res.data : l));
      } else {
        const res = await axios.post(`${API}/audience-lists`, {
          name: listName.trim(),
          description: description.trim(),
          groups: selectedGroups,
          contact_list_ids: selectedContactListIds,
          group_list_ids: selectedGroupListIds
        });
        setAudienceLists(prev => [...prev, res.data]);
      }
      handleCancel();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save audience list');
    }
  };

  const handleStartEdit = (item: AudienceList) => {
    setEditingListId(item.id);
    setListName(item.name);
    setDescription(item.description || '');
    setSelectedGroups(item.groups || []);
    setSelectedContactListIds(item.contact_list_ids || []);
    setSelectedGroupListIds(item.group_list_ids || []);
    setIsCreating(true);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingListId(null);
    setListName('');
    setDescription('');
    setSelectedGroups([]);
    setSelectedContactListIds([]);
    setSelectedGroupListIds([]);
  };

  const handleDeleteList = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete the audience list "${name}"?`)) return;

    try {
      await axios.delete(`${API}/audience-lists/${id}`);
      setAudienceLists(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      alert('Failed to delete audience list.');
    }
  };

  const toggleContactListSelection = (id: number) => {
    setSelectedContactListIds(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const toggleGroupListSelection = (id: number) => {
    setSelectedGroupListIds(prev =>
      prev.includes(id) ? prev.filter(gId => gId !== id) : [...prev, id]
    );
  };

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (showGroupsOnly) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold text-white">WhatsApp Groups</h3>
            <p className="text-slate-400 text-sm">View all WhatsApp group chats synced from your connected accounts.</p>
          </div>
          {onSwitchToCreateAudience && (
            <button
              onClick={onSwitchToCreateAudience}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer text-sm shadow-md"
            >
              <Plus size={18} /> Create Group List
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search WhatsApp groups by name..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="glass-card p-12 text-center space-y-4">
            <div className="inline-flex p-4 bg-indigo-500/10 rounded-full text-indigo-400">
              <Users size={32} />
            </div>
            <h3 className="text-lg font-semibold text-white">No WhatsApp Groups Found</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto">
              Make sure your WhatsApp account is connected under WhatsApp Status to sync your group chats.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredGroups.map(g => (
              <div key={g.id} className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-sm">
                  {g.name.charAt(0).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-semibold text-white truncate text-sm">{g.name}</h4>
                  <p className="text-xs text-slate-400 font-mono truncate">{g.id}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Audience Lists</h3>
          <p className="text-slate-400 text-sm">Combine Contact Lists and Group Lists into unified targeting profiles.</p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Plus size={18} /> Add Audience List
          </button>
        )}
      </div>

      {isCreating && (
        <form onSubmit={handleSaveList} className="glass-card p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
            <h3 className="text-lg font-semibold text-white">
              {editingListId !== null ? 'Edit Audience List' : 'Create New Audience List'}
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
              <label className="block text-slate-300 text-sm font-medium mb-1">Audience List Name *</label>
              <input
                type="text"
                value={listName}
                onChange={e => setListName(e.target.value)}
                placeholder="e.g. Real Estate Investors & Leads"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-medium mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. Combined targeting for active groups and imported leads"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
              />
            </div>

            {/* Contact Lists Selection */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Include Contact Lists ({selectedContactListIds.length} selected)</label>
              {contactLists.length > 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                  {contactLists.map(cl => (
                    <div
                      key={cl.id}
                      onClick={() => toggleContactListSelection(cl.id)}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                        selectedContactListIds.includes(cl.id)
                          ? 'bg-indigo-600/20 border border-indigo-500/30 text-white'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {selectedContactListIds.includes(cl.id) ? (
                        <CheckSquare size={14} className="text-indigo-400" />
                      ) : (
                        <Square size={14} className="text-slate-500" />
                      )}
                      <span className="font-medium">{cl.name}</span>
                      <span className="text-[10px] text-slate-500">({(cl.contact_ids || []).length} contacts)</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-xs bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                  No Contact Lists yet. Create one under the "Contact Lists" tab first.
                </p>
              )}
            </div>

            {/* Saved Group Lists Selection */}
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Include Group Lists ({selectedGroupListIds.length} selected)</label>
              {groupLists.length > 0 ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                  {groupLists.map(gl => (
                    <div
                      key={gl.id}
                      onClick={() => toggleGroupListSelection(gl.id)}
                      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                        selectedGroupListIds.includes(gl.id)
                          ? 'bg-indigo-600/20 border border-indigo-500/30 text-white'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      {selectedGroupListIds.includes(gl.id) ? (
                        <CheckSquare size={14} className="text-indigo-400" />
                      ) : (
                        <Square size={14} className="text-slate-500" />
                      )}
                      <span className="font-medium">{gl.name}</span>
                      <span className="text-[10px] text-slate-500">({(gl.groups || []).length} groups)</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-xs bg-slate-900/50 border border-slate-800 rounded-xl p-3">
                  No Group Lists yet. Create one under the "Group Lists" tab first.
                </p>
              )}
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
              <Save size={18} /> Save Audience List
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : audienceLists.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="inline-flex p-4 bg-indigo-500/10 rounded-full text-indigo-400">
            <Users size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white">No Audience Lists Yet</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Create lists combining Contact Lists and Group Lists to broadcast announcements seamlessly.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Plus size={16} /> Create First Audience List
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {audienceLists.map(l => (
            <div key={l.id} className="glass-card p-5 flex flex-col justify-between space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-semibold text-white">{l.name}</h4>
                  {l.description && <p className="text-slate-400 text-xs mt-0.5">{l.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(l.groups || []).length > 0 && (
                      <span className="text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded-md font-medium">
                        {(l.groups || []).length} groups (legacy)
                      </span>
                    )}
                    {(l.group_list_ids || []).length > 0 && (
                      <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                        <Users size={11} /> {l.group_list_ids?.length} group lists
                      </span>
                    )}
                    {(l.contact_list_ids || []).length > 0 && (
                      <span className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                        <List size={11} /> {l.contact_list_ids?.length} contact lists
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStartEdit(l)}
                    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors cursor-pointer"
                    title="Edit Audience List"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteList(l.id, l.name)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors cursor-pointer"
                    title="Delete Audience List"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Groups snippet */}
              {(l.groups || []).length > 0 && (
                <div className="bg-slate-900/30 border border-slate-800/50 rounded-lg p-3 max-h-28 overflow-y-auto space-y-1">
                  {(l.groups || []).map(gid => {
                    const grp = groups.find(g => g.id === gid);
                    return (
                      <div key={gid} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 truncate font-medium max-w-[200px]">
                          {grp ? grp.name : 'Group Chat'}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate max-w-[120px] font-mono">
                          {gid}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AudienceLists;
