import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { HiPlus, HiXMark } from 'react-icons/hi2';
import PropTypes from 'prop-types';

const iconOptions = ['🏷️', '📱', '💻', '🎮', '📺', '🔒', '⭐', '🚀'];
const colorOptions = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16'];

// Manages traffic-rule tags: create/edit/delete tags and assign tags to rules.
// Rules come from useTrafficRules (customAPIRules); onRulesChange is reRender.
const RuleTagManager = forwardRef(function RuleTagManager({ rules, onRulesChange }, ref) {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(false);
    const [tagForm, setTagForm] = useState({ name: '', description: '', color: '#3B82F6', icon: '🏷️' });
    const [editingTag, setEditingTag] = useState(null);
    const [selectedRuleId, setSelectedRuleId] = useState('');
    const [selectedTagIds, setSelectedTagIds] = useState([]);
    const [assigning, setAssigning] = useState(false);
    const managerDialogRef = useRef();

    useImperativeHandle(ref, () => ({
        openManager: () => managerDialogRef.current?.showModal(),
    }));

    const fetchTags = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/rule-tags');
            if (res.ok) {
                const data = await res.json();
                setTags([...data].sort((a, b) => a.name.localeCompare(b.name)));
            }
        } catch (error) {
            console.error('Error fetching rule tags:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchTags(); }, []);

    const handleSaveTag = async () => {
        if (!tagForm.name.trim()) return;
        try {
            setLoading(true);
            const url = editingTag ? `/api/rule-tags/${editingTag.id}` : '/api/rule-tags';
            const method = editingTag ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(tagForm),
            });
            if (res.ok) {
                await fetchTags();
                setEditingTag(null);
                setTagForm({ name: '', description: '', color: '#3B82F6', icon: '🏷️' });
            }
        } catch (error) {
            console.error('Error saving rule tag:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteTag = async (tagId) => {
        if (!confirm('Delete this rule tag? Rules will keep their other tags.')) return;
        try {
            setLoading(true);
            const res = await fetch(`/api/rule-tags/${tagId}`, { method: 'DELETE' });
            if (res.ok) {
                await fetchTags();
            }
        } catch (error) {
            console.error('Error deleting rule tag:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEditTag = (tag) => {
        setEditingTag(tag);
        setTagForm({
            name: tag.name,
            description: tag.description || '',
            color: tag.color || '#3B82F6',
            icon: tag.icon || '🏷️',
        });
    };

    // Load the selected rule's current tags into the assignment checkboxes
    const handleSelectRule = (ruleId) => {
        setSelectedRuleId(ruleId);
        const rule = (rules || []).find(r => r?.trafficRule?.id === parseInt(ruleId));
        const ruleTagIds = (rule?.ruleTags || []).map(t => t.id);
        setSelectedTagIds(ruleTagIds);
    };

    const handleSaveAssignments = async () => {
        if (!selectedRuleId) return;
        try {
            setAssigning(true);
            const res = await fetch(`/api/traffic-rules/${selectedRuleId}/tags`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tagIds: selectedTagIds }),
            });
            if (res.ok) {
                setSelectedRuleId('');
                setSelectedTagIds([]);
                onRulesChange?.();
            }
        } catch (error) {
            console.error('Error assigning rule tags:', error);
        } finally {
            setAssigning(false);
        }
    };

    return (
        <dialog ref={managerDialogRef} className="modal">
            <div className="modal-box w-11/12 max-w-3xl">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-base-content">Rule Tags</h2>
                    <div className="flex items-center gap-2">
                        <button
                            className="btn btn-primary btn-sm gap-1"
                            onClick={() => { setEditingTag(null); setTagForm({ name: '', description: '', color: '#3B82F6', icon: '🏷️' }); }}
                        >
                            <HiPlus className="w-4 h-4" /> Add Tag
                        </button>
                        <form method="dialog">
                            <button className="btn btn-sm btn-circle btn-ghost">✕</button>
                        </form>
                    </div>
                </div>

                {/* Create / edit tag form */}
                <div className="bg-base-200 rounded-lg p-4 mb-5 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[160px]">
                        <label className="label"><span className="label-text">Name</span></label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            placeholder="Tag name"
                            value={tagForm.name}
                            onChange={(e) => setTagForm(prev => ({ ...prev, name: e.target.value }))}
                        />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                        <label className="label"><span className="label-text">Description</span></label>
                        <input
                            type="text"
                            className="input input-bordered w-full"
                            placeholder="Optional description"
                            value={tagForm.description}
                            onChange={(e) => setTagForm(prev => ({ ...prev, description: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className="label"><span className="label-text">Icon</span></label>
                        <div className="flex gap-1 flex-wrap">
                            {iconOptions.map(icon => (
                                <button
                                    key={icon}
                                    type="button"
                                    className={`btn btn-xs ${tagForm.icon === icon ? 'btn-primary' : 'btn-ghost'}`}
                                    onClick={() => setTagForm(prev => ({ ...prev, icon }))}
                                >
                                    {icon}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="label"><span className="label-text">Color</span></label>
                        <div className="flex gap-1.5 flex-wrap">
                            {colorOptions.map(color => (
                                <button
                                    key={color}
                                    type="button"
                                    className={`w-6 h-6 rounded-full border-2 ${tagForm.color === color ? 'border-base-content' : 'border-base-300'}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => setTagForm(prev => ({ ...prev, color }))}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="ml-auto">
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveTag}
                            disabled={!tagForm.name.trim() || loading}
                        >
                            {loading ? 'Saving...' : editingTag ? 'Update Tag' : 'Create Tag'}
                        </button>
                    </div>
                </div>

                {/* Tag list */}
                <div className="mb-5">
                    <h4 className="font-semibold mb-3">Tags ({tags.length})</h4>
                    {tags.length === 0 ? (
                        <p className="text-sm text-base-content/50">No rule tags yet. Create one above.</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {tags.map(tag => (
                                <div
                                    key={tag.id}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                                    style={{ backgroundColor: tag.color + '18', borderColor: tag.color + '50' }}
                                >
                                    <span>{tag.icon}</span>
                                    <span className="text-sm font-semibold">{tag.name}</span>
                                    <button
                                        className="text-base-content/40 hover:text-primary"
                                        title="Edit tag"
                                        onClick={() => handleEditTag(tag)}
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="text-base-content/40 hover:text-error"
                                        title="Delete tag"
                                        onClick={() => handleDeleteTag(tag.id)}
                                    >
                                        <HiXMark className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Assign tags to a rule */}
                <div className="border-t border-base-300 pt-4">
                    <h4 className="font-semibold mb-3">Assign tags to a rule</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <select
                            className="select select-bordered flex-1"
                            value={selectedRuleId}
                            onChange={(e) => handleSelectRule(e.target.value)}
                        >
                            <option value="">Select a rule…</option>
                            {(rules || []).map(rule => (
                                <option key={rule?.trafficRule?.id} value={rule?.trafficRule?.id}>
                                    {rule?.trafficRule?.description}
                                </option>
                            ))}
                        </select>
                        <div className="flex items-center gap-2 flex-wrap">
                            {tags.map(tag => (
                                <label key={tag.id} className="cursor-pointer flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm"
                                        checked={selectedTagIds.includes(tag.id)}
                                        onChange={(e) => {
                                            setSelectedTagIds(prev =>
                                                e.target.checked
                                                    ? [...prev, tag.id]
                                                    : prev.filter(id => id !== tag.id)
                                            );
                                        }}
                                    />
                                    <span className="text-sm">{tag.icon} {tag.name}</span>
                                </label>
                            ))}
                        </div>
                        <button
                            className="btn btn-primary"
                            onClick={handleSaveAssignments}
                            disabled={!selectedRuleId || assigning}
                        >
                            {assigning ? 'Saving...' : 'Assign'}
                        </button>
                    </div>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop">
                <button>close</button>
            </form>
        </dialog>
    );
});

RuleTagManager.propTypes = {
    rules: PropTypes.array,
    onRulesChange: PropTypes.func,
};

export default RuleTagManager;
