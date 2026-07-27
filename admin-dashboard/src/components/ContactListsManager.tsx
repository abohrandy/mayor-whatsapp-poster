import { useState, useEffect } from 'react';
import { List, Plus, Search, Trash2, Edit2, X, Save, CheckSquare, Square, Users } from 'lucide-react';
import axios from 'axios';

interface Contact {
  id: number;
  name: string;
  phone_number: string;
}

interface ContactList {
  id: number;
  name: string;
  description: string;
  contact_ids: number[];
  created_at: string;
}

const ContactListsManager = () => {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const API = '/api';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [listsRes, contactsRes] = await Promise.all([
        axios.get(`${API}/contact-lists`),
        axios.get(`${API}/contacts`)
      ]);
      setLists(listsRes.data);
      setAllContacts(contactsRes.data);
    } catch (e) {
      console.error('Error fetching contact lists:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (list?: ContactList) => {
    if (list) {
      setEditingId(list.id);
      setName(list.name);
      setDescription(list.description || '');
      setSelectedContactIds(list.contact_ids || []);
    } else {
      setEditingId(null);
      setName('');
      setDescription('');
      setSelectedContactIds([]);
    }
    setShowModal(true);
  };

  const handleSaveList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('List name is required.');
      return;
    }

    try {
      if (editingId !== null) {
        await axios.put(`${API}/contact-lists/${editingId}`, {
          name: name.trim(),
          description: description.trim(),
          contact_ids: selectedContactIds
        });
      } else {
        await axios.post(`${API}/contact-lists`, {
          name: name.trim(),
          description: description.trim(),
          contact_ids: selectedContactIds
        });
      }
      setShowModal(false);
      fetchData();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save contact list');
    }
  };

  const handleDeleteList = async (id: number, listName: string) => {
    if (!window.confirm(`Are you sure you want to delete contact list "${listName}"?`)) return;
    try {
      await axios.delete(`${API}/contact-lists/${id}`);
      setLists(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      alert('Failed to delete contact list.');
    }
  };

  const toggleContactSelection = (id: number) => {
    setSelectedContactIds(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const filteredContacts = allContacts.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone_number.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-white">Contact Lists</h3>
          <p className="text-slate-400 text-sm">Organize your individual contacts into targeted customer segments.</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
        >
          <Plus size={16} /> Create Contact List
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : lists.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="inline-flex p-4 bg-indigo-500/10 rounded-full text-indigo-400">
            <List size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white">No Contact Lists Yet</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Group individual contacts into lists (e.g. "VIP Clients", "Weekly Leads") to broadcast personalized messages.
          </p>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Plus size={16} /> Create First Contact List
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lists.map(l => (
            <div key={l.id} className="glass-card p-5 flex flex-col justify-between space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-lg font-semibold text-white">{l.name}</h4>
                  {l.description && <p className="text-slate-400 text-xs mt-0.5">{l.description}</p>}
                  <span className="inline-flex items-center gap-1 text-xs text-indigo-400 mt-2 font-medium">
                    <Users size={12} /> {(l.contact_ids || []).length} contacts included
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleOpenModal(l)}
                    className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors cursor-pointer"
                    title="Edit Contact List"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDeleteList(l.id, l.name)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors cursor-pointer"
                    title="Delete Contact List"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
              <h3 className="text-lg font-semibold text-white">
                {editingId !== null ? 'Edit Contact List' : 'Create Contact List'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveList} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">List Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. VIP Customers, Lagos Leads"
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
                  placeholder="e.g. High value customers for promotional offers"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">
                  Select Members ({selectedContactIds.length} selected)
                </label>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search contacts..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="bg-slate-900/50 border border-slate-800 rounded-xl max-h-52 overflow-y-auto p-2 space-y-1">
                  {filteredContacts.length === 0 ? (
                    <p className="text-slate-500 text-xs text-center py-4">No contacts found in directory.</p>
                  ) : (
                    filteredContacts.map(c => (
                      <div
                        key={c.id}
                        onClick={() => toggleContactSelection(c.id)}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                          selectedContactIds.includes(c.id)
                            ? 'bg-indigo-600/20 border border-indigo-500/30'
                            : 'hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {selectedContactIds.includes(c.id) ? (
                            <CheckSquare size={14} className="text-indigo-400" />
                          ) : (
                            <Square size={14} className="text-slate-500" />
                          )}
                          <span className="text-slate-200 font-medium">{c.name}</span>
                        </div>
                        <span className="text-slate-400 font-mono text-[11px]">{c.phone_number}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-700/50 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer text-sm"
                >
                  <Save size={16} /> Save List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactListsManager;
