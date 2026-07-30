import { useState, useEffect } from 'react';
import { User, Plus, Search, Trash2, Edit2, Upload, Tag, X, Save, FileSpreadsheet } from 'lucide-react';
import axios from 'axios';

interface Contact {
  id: number;
  name: string;
  phone_number: string;
  email: string | null;
  tags: string[];
  custom_fields: Record<string, string>;
  whatsapp_session_id?: string | null;
  created_at: string;
}

interface WASession {
  session_id: string;
  push_name?: string;
  me_jid?: string;
}

const ContactsManager = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sessions, setSessions] = useState<WASession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('');

  // Add / Edit Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTags, setFormTags] = useState('');

  // Bulk Import Modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);

  const API = '/api';

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [searchTerm, selectedTag, selectedSession]);

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API}/whatsapp/status`);
      setSessions(res.data.sessions || []);
    } catch (e) {
      console.error('Error fetching whatsapp sessions:', e);
    }
  };

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/contacts`, {
        params: { search: searchTerm, tag: selectedTag, whatsapp_session_id: selectedSession }
      });
      setContacts(res.data);
    } catch (e) {
      console.error('Error fetching contacts:', e);
    } finally {
      setLoading(false);
    }
  };

  const allTags = Array.from(
    new Set(contacts.flatMap(c => Array.isArray(c.tags) ? c.tags : []))
  );

  const handleOpenModal = (contact?: Contact) => {
    if (contact) {
      setEditingId(contact.id);
      setFormName(contact.name);
      setFormPhone(contact.phone_number);
      setFormEmail(contact.email || '');
      setFormTags(Array.isArray(contact.tags) ? contact.tags.join(', ') : '');
    } else {
      setEditingId(null);
      setFormName('');
      setFormPhone('');
      setFormEmail('');
      setFormTags('');
    }
    setShowModal(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) {
      alert('Name and phone number are required.');
      return;
    }

    const tagArray = formTags.split(',').map(t => t.trim()).filter(Boolean);

    try {
      if (editingId !== null) {
        await axios.put(`${API}/contacts/${editingId}`, {
          name: formName.trim(),
          phone_number: formPhone.trim(),
          email: formEmail.trim() || null,
          tags: tagArray
        });
      } else {
        await axios.post(`${API}/contacts`, {
          name: formName.trim(),
          phone_number: formPhone.trim(),
          email: formEmail.trim() || null,
          tags: tagArray
        });
      }
      setShowModal(false);
      fetchContacts();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save contact');
    }
  };

  const handleDeleteContact = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete contact "${name}"?`)) return;
    try {
      await axios.delete(`${API}/contacts/${id}`);
      setContacts(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      alert('Failed to delete contact.');
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importText.trim()) return;

    setImporting(true);
    try {
      // Parse lines: Name, Phone, Email, Tags
      const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
      const parsedContacts = lines.map(line => {
        const parts = line.split(',').map(p => p.trim());
        return {
          name: parts[0] || 'Unknown',
          phone_number: parts[1] || '',
          email: parts[2] || null,
          tags: parts[3] ? parts[3].split(';').map(t => t.trim()) : []
        };
      }).filter(c => c.phone_number.length > 0);

      const res = await axios.post(`${API}/contacts/import`, { contacts: parsedContacts });
      alert(res.data.message || 'Import complete.');
      setShowImportModal(false);
      setImportText('');
      fetchContacts();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to import contacts');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-white">Contacts Directory</h3>
          <p className="text-slate-400 text-sm">Manage individual customer contacts, phone numbers, and tags.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer border border-slate-700"
          >
            <Upload size={16} /> Import CSV
          </button>
          <button
            onClick={() => handleOpenModal()}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
          >
            <Plus size={16} /> Add Contact
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search contacts by name, phone or email..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {sessions.length > 0 && (
          <select
            value={selectedSession}
            onChange={e => setSelectedSession(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="">All WhatsApp Accounts ({sessions.length})</option>
            {sessions.map(s => (
              <option key={s.session_id} value={s.session_id}>
                {s.push_name || s.me_jid || s.session_id}
              </option>
            ))}
          </select>
        )}

        {allTags.length > 0 && (
          <select
            value={selectedTag}
            onChange={e => setSelectedTag(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="">All Tags ({allTags.length})</option>
            {allTags.map(tag => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        )}
      </div>

      {/* Contacts Table */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        </div>
      ) : contacts.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-4">
          <div className="inline-flex p-4 bg-indigo-500/10 rounded-full text-indigo-400">
            <User size={32} />
          </div>
          <h3 className="text-lg font-semibold text-white">No Contacts Found</h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Add contacts manually or import a list of phone numbers to build your custom audience segments.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => handleOpenModal()}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer"
            >
              <Plus size={16} /> Add First Contact
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900/50 text-slate-400 text-xs uppercase border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Phone Number</th>
                  <th className="px-6 py-3">Email</th>
                  <th className="px-6 py-3">Tags</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {contacts.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center font-bold text-xs">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      {c.name}
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-300">{c.phone_number}</td>
                    <td className="px-6 py-4 text-slate-400">{c.email || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {c.tags && c.tags.length > 0 ? (
                          c.tags.map(tag => (
                            <span key={tag} className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[11px] px-2 py-0.5 rounded-md font-medium">
                              <Tag size={10} /> {tag}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-500 text-xs">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenModal(c)}
                        className="p-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors cursor-pointer"
                        title="Edit Contact"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(c.id, c.name)}
                        className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors cursor-pointer"
                        title="Delete Contact"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
              <h3 className="text-lg font-semibold text-white">
                {editingId !== null ? 'Edit Contact' : 'Add New Contact'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">WhatsApp Phone Number *</label>
                <input
                  type="text"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="e.g. +2348012345678"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">Email Address (Optional)</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="e.g. john@example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1">Tags (Comma-separated)</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={e => setFormTags(e.target.value)}
                  placeholder="e.g. Customer, Lead, VIP"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-700/50 pt-4 mt-6">
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
                  <Save size={16} /> Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="glass-card w-full max-w-lg p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-slate-700/50 pb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <FileSpreadsheet className="text-indigo-400" size={20} /> Bulk Import Contacts
              </h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleBulkImport} className="space-y-4">
              <p className="text-slate-300 text-sm">
                Paste CSV or line-separated contact records. Format per line:
                <code className="block bg-slate-900 text-indigo-300 p-2 rounded mt-1 font-mono text-xs">
                  Name, Phone Number, Email, Tag1;Tag2
                </code>
              </p>

              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={`John Doe, +2348012345678, john@example.com, Lead;VIP\nJane Smith, +2348098765432, jane@example.com, Customer`}
                className="w-full h-44 bg-slate-800 border border-slate-700 rounded-lg p-3 text-white text-xs font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />

              <div className="flex justify-end gap-3 border-t border-slate-700/50 pt-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer text-sm disabled:opacity-50"
                >
                  <Upload size={16} /> {importing ? 'Importing...' : 'Start Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactsManager;
