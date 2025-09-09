import React, { useEffect, useState } from 'react';
import { Amplify } from 'aws-amplify';
import outputs from '../amplify_outputs.json';

// Amplify UI (provides <Authenticator/>)
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

// Amplify Data client
import { generateClient } from 'aws-amplify/data';

// Amplify Storage helpers (upload image, get signed URL, delete)
import { uploadData, getUrl, remove } from 'aws-amplify/storage';

// Configure Amplify with the generated client configuration
Amplify.configure(outputs);

// Create a Data client instance
const client = generateClient();

export default function App() {
  const [notes, setNotes] = useState([]);
  const [formState, setFormState] = useState({ name: '', description: '' });
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  // Helper: load an image URL for a stored key (if present)
  async function withImageUrl(note) {
    if (!note?.image) return note;
    try {
      const { url } = await getUrl({ key: note.image });
      return { ...note, imageUrl: url.href };
    } catch (err) {
      console.error('getUrl error:', err);
      return note;
    }
  }

  // fetchNotes - list items in the Notes model and hydrate image URLs
  async function fetchNotes() {
    try {
      setLoading(true);
      // If your model is named `Note` instead of `Notes`, change `client.models.Notes` accordingly.
      const { data } = await client.models.Notes.list();
      const withUrls = await Promise.all((data ?? []).map(withImageUrl));
      setNotes(withUrls);
    } catch (err) {
      console.error('fetchNotes error:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // createNote - create a new note; if user selected an image, upload to Storage and save its key
  async function createNote(e) {
    e.preventDefault();
    const { name, description } = formState;
    if (!name?.trim()) return;

    try {
      setLoading(true);
      let imageKey = undefined;

      if (file) {
        const key = `images/${Date.now()}-${file.name}`;
        // Upload the image to S3 via Amplify Storage
        await uploadData({
          key,
          data: file,
          options: { contentType: file.type },
        }).result; // wait for completion
        imageKey = key;
      }

      // Create the new note via the Data client
      const { data: created } = await client.models.Notes.create({
        name,
        description,
        image: imageKey, // associate uploaded image key if present
      });

      // Reset the form and refresh list
      setFormState({ name: '', description: '' });
      setFile(null);

      // Optimistically add to local state (hydrate image URL if any)
      const createdWithUrl = await withImageUrl(created);
      setNotes((prev) => [createdWithUrl, ...prev]);
    } catch (err) {
      console.error('createNote error:', err);
    } finally {
      setLoading(false);
    }
  }

  // deleteNote - delete the selected note (and its image, if it has one)
  async function deleteNote(note) {
    if (!note?.id) return;
    try {
      setLoading(true);
      await client.models.Notes.delete({ id: note.id });
      if (note.image) {
        try {
          await remove({ key: note.image });
        } catch (rmErr) {
          console.warn('remove image warning:', rmErr);
        }
      }
      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      console.error('deleteNote error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Authenticator>
      {({ signOut, user }) => (
        <main className="min-h-screen bg-gray-50">
          <header className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Notes App</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{user?.username}</span>
              <button
                className="px-3 py-1.5 rounded-md bg-gray-800 text-white hover:bg-gray-700"
                onClick={signOut}
              >
                Sign out
              </button>
            </div>
          </header>

          <section className="max-w-3xl mx-auto px-4">
            <form onSubmit={createNote} className="bg-white p-4 rounded-xl shadow">
              <div className="grid gap-3">
                <input
                  className="border rounded-md px-3 py-2"
                  placeholder="Name"
                  value={formState.name}
                  onChange={(e) => setFormState((s) => ({ ...s, name: e.target.value }))}
                />
                <textarea
                  className="border rounded-md px-3 py-2"
                  placeholder="Description"
                  rows={3}
                  value={formState.description}
                  onChange={(e) => setFormState((s) => ({ ...s, description: e.target.value }))}
                />
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50"
                  >
                    {loading ? 'Working…' : 'Create Note'}
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={fetchNotes}
                    className="px-3 py-2 rounded-md border"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="max-w-3xl mx-auto px-4 mt-6">
            {notes.length === 0 ? (
              <p className="text-gray-600">No notes yet.</p>
            ) : (
              <ul className="grid gap-4">
                {notes.map((note) => (
                  <li key={note.id} className="bg-white p-4 rounded-xl shadow flex gap-4 items-start">
                    {note.imageUrl && (
                      <img
                        src={note.imageUrl}
                        alt={note.name}
                        className="w-24 h-24 object-cover rounded-md"
                      />)
                    }
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-lg">{note.name}</h3>
                      {note.description && (
                        <p className="text-gray-700 whitespace-pre-wrap break-words">{note.description}</p>
                      )}
                      {note.image && (
                        <p className="text-xs text-gray-500 mt-1">image key: {note.image}</p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteNote(note)}
                      disabled={loading}
                      className="px-3 py-2 rounded-md bg-red-600 text-white disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      )}
    </Authenticator>
  );
}