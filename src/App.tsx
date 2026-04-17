import React, { useState, useRef, useEffect, ChangeEvent } from 'react';
import { GoogleGenAI } from '@google/genai';
import { 
  Bot, 
  User, 
  Plus, 
  FileText, 
  Send, 
  Trash2, 
  Library, 
  Menu,
  X,
  AlertCircle,
  FileBox,
  LogOut,
  UploadCloud,
  File
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, orderBy, onSnapshot, deleteDoc, doc, addDoc } from 'firebase/firestore';

// Ensure the API key exists
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

interface DocumentSnippet {
  id: string;
  title: string;
  content: string;
  createdAt: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [documents, setDocuments] = useState<DocumentSnippet[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  
  // Modal State for alerts/confirms
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    message: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'alert', message: '' });

  const showAlert = (message: string) => setModalConfig({ isOpen: true, type: 'alert', message });
  const showConfirm = (message: string, onConfirm: () => void) => setModalConfig({ isOpen: true, type: 'confirm', message, onConfirm });

  // Document Add State
  const [isAddingDoc, setIsAddingDoc] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  
  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Firebase Real-time listeners
  useEffect(() => {
    if (!isAuthReady || !user) {
      setDocuments([]);
      setMessages([]);
      return;
    }

    const qDocs = query(
      collection(db, 'documents'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubDocs = onSnapshot(qDocs, (snapshot) => {
      const docsData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as DocumentSnippet[];
      setDocuments(docsData);
    });

    const qMsgs = query(
      collection(db, 'messages'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'asc')
    );

    const unsubMsgs = onSnapshot(qMsgs, (snapshot) => {
      const msgsData = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      })) as Message[];
      setMessages(msgsData);
    });

    return () => {
      unsubDocs();
      unsubMsgs();
    };
  }, [user, isAuthReady]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  if (!isAuthReady) {
    return <div className="h-screen flex items-center justify-center bg-[#f5f5f5]">Загрузка...</div>;
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#f5f5f5]">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Library className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">NotebookLM</h1>
          <p className="text-gray-500 mb-8 text-sm">Синхронизируйте свои знания, загружайте документы и задавайте вопросы.</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors shadow-sm"
          >
            Войти через Google
          </button>
        </div>
      </div>
    );
  }

  // Handle setting a new document manually
  const handleAddDocumentManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !docContent.trim() || !user) return;

    try {
      await addDoc(collection(db, 'documents'), {
        uid: user.uid,
        title: docTitle.trim(),
        content: docContent.trim(),
        createdAt: Date.now()
      });
      setDocTitle("");
      setDocContent("");
      setIsAddingDoc(false);
    } catch (error) {
      console.error("Error adding document:", error);
      showAlert("Не удалось сохранить документ.");
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch('/api/parse-file', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Ошибка при обработке файла");
      }

      await addDoc(collection(db, 'documents'), {
        uid: user.uid,
        title: data.filename,
        content: data.text,
        createdAt: Date.now()
      });
      
    } catch (error) {
      console.error("Upload error:", error);
      showAlert(`Ошибка загрузки: ${error instanceof Error ? error.message : "Неизвестная ошибка"}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const removeDocument = (id: string) => {
    showConfirm("Удалить этот источник?", async () => {
      try {
        await deleteDoc(doc(db, 'documents', id));
      } catch (error) {
        console.error("Ошибка удаления", error);
      }
    });
  };

  const clearChat = () => {
    showConfirm("Удалить всю историю чата?", async () => {
      try {
        const msgsToDelete = messages.map(m => deleteDoc(doc(db, 'messages', m.id)));
        await Promise.all(msgsToDelete);
      } catch (error) {
        console.error("Ошибка очистки чата", error);
      }
    });
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isGenerating) return;
    if (!ai) {
      showAlert("Не найден ключ API Gemini. Пожалуйста, установите GEMINI_API_KEY.");
      return;
    }
    if (!user) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsGenerating(true);

    try {
      // Save User Message to Firestore
      await addDoc(collection(db, 'messages'), {
        uid: user.uid,
        role: 'user',
        content: userMessage,
        createdAt: Date.now()
      });

      const formattedDocs = documents.map((d) => `--- Документ: ${d.title} ---\n${d.content}`).join("\n\n");
      const hasDocs = documents.length > 0;
      
      const systemInstruction = `Вы — эксперт-аналитик и помощник по базе знаний NotebookLM. Вы общаетесь с пользователем, который предоставил список документов. 
Ваша задача — отвечать на вопросы пользователя СТРОГО и ИСКЛЮЧИТЕЛЬНО на основе информации, содержащейся в предоставленных документах базы знаний. 
Не используйте знания извне. 
Если в предоставленных документах нет ответа, скажите: "В предоставленных документах нет информации для ответа на этот вопрос". 
Предоставляйте подробные и полезные ответы, если информация доступна в документах. Цитируйте или ссылайтесь на название документа, если это уместно. Отвечайте на русском языке.

ДОКУМЕНТЫ БАЗЫ ЗНАНИЙ:
${hasDocs ? formattedDocs : "Документы пока не предоставлены. Сообщите пользователю, что ему следует сначала добавить несколько документов в базу знаний."}
`;

      const historyContents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
      historyContents.push({ role: 'user', parts: [{ text: userMessage }] });

      const stream = await ai.models.generateContentStream({
        model: 'gemini-3.1-pro-preview', // Switch to best reasoning model
        contents: historyContents,
        config: { systemInstruction }
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        if (chunk.text) {
          fullResponse += chunk.text;
        }
      }

      // Save Assistant Message to Firestore
      await addDoc(collection(db, 'messages'), {
        uid: user.uid,
        role: 'assistant',
        content: fullResponse,
        createdAt: Date.now()
      });

    } catch (error) {
      console.error(error);
      showAlert("Произошла ошибка при генерации ответа.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-[#f5f5f5] text-gray-900 font-sans overflow-hidden">
      
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-20 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Custom Modal for Alerts and Confirms */}
      <AnimatePresence>
        {modalConfig.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center"
            >
              <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-indigo-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Внимание</h3>
              <p className="text-gray-600 mb-6 text-sm whitespace-pre-wrap">{modalConfig.message}</p>
              <div className="flex gap-3 justify-center">
                {modalConfig.type === 'confirm' && (
                  <button 
                    onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 font-medium rounded-xl transition-colors text-sm"
                  >
                    Отмена
                  </button>
                )}
                <button 
                  onClick={() => {
                    if (modalConfig.onConfirm) modalConfig.onConfirm();
                    setModalConfig({ ...modalConfig, isOpen: false });
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 font-medium rounded-xl transition-colors text-sm shadow-sm"
                >
                  {modalConfig.type === 'confirm' ? 'Подтвердить' : 'ОК'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Knowledge Base */}
      <motion.aside
        initial={{ x: -320 }}
        animate={{ x: isSidebarOpen ? 0 : window.innerWidth >= 768 ? 0 : -320 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="fixed md:static inset-y-0 left-0 w-80 bg-white border-r border-gray-200 shadow-xl md:shadow-none z-30 flex flex-col"
      >
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-2 text-gray-900 font-semibold text-lg">
            <Library className="w-5 h-5 text-indigo-600" />
            <span>База знаний</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload}
            className="hidden" 
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
          />

          {isUploading && (
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 text-sm font-medium flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </span>
              Извлекаем текст из файла...
            </div>
          )}

          {documents.length === 0 && !isAddingDoc && !isUploading && (
            <div className="text-center p-6 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 text-gray-500">
              <FileBox className="w-8 h-8 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">Пока нет источников. Загрузите PDF, DOCX, XLSX или TXT, чтобы начать.</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {documents.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group relative bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-gray-300 transition-all"
              >
                <div className="flex justify-between items-start mb-2 pr-6">
                  <h3 className="font-medium text-sm text-gray-900 truncate" title={doc.title}>
                    <File className="w-4 h-4 inline-block mr-1 text-indigo-400" />
                    {doc.title}
                  </h3>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{doc.content}</p>
                
                <button
                  onClick={() => removeDocument(doc.id)}
                  className="absolute top-3 right-3 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Удалить документ"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {isAddingDoc && (
            <motion.form 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-50 border border-gray-200 p-4 rounded-xl shadow-sm flex flex-col gap-3"
              onSubmit={handleAddDocumentManually}
            >
              <input
                type="text"
                placeholder="Название фрагмента"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                className="w-full text-sm placeholder:text-gray-400 bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-text"
                required
              />
              <textarea
                placeholder="Вставьте текст сюда..."
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                className="w-full text-sm placeholder:text-gray-400 bg-white border border-gray-300 rounded-lg px-3 py-2 h-32 resize-none outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-text"
                required
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => { setIsAddingDoc(false); setDocTitle(""); setDocContent(""); }}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-md transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 rounded-md shadow-sm transition-colors"
                >
                  Сохранить
                </button>
              </div>
            </motion.form>
          )}
        </div>

        {!isAddingDoc && (
          <div className="p-4 border-t border-gray-100 bg-white space-y-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium py-2.5 rounded-xl hover:bg-indigo-100 transition-all shadow-sm active:scale-[0.98]"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="text-sm">Загрузить файл</span>
            </button>
            <button
              onClick={() => setIsAddingDoc(true)}
              className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Вставить текст</span>
            </button>
          </div>
        )}

        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-2 truncate pr-2" title={user.email || ""}>
            <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}`} className="w-8 h-8 rounded-full shadow-sm" alt="U" />
            <span className="text-xs font-medium text-gray-700 truncate">{user.email}</span>
          </div>
          <button onClick={logout} className="text-gray-400 hover:text-gray-700 transition-colors" title="Выйти">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </motion.aside>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#f5f5f5] relative">
        <header className="h-16 flex-shrink-0 bg-white border-b border-gray-200 px-4 flex justify-between items-center shadow-sm relative z-10">
          <div className="flex items-center">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="mr-3 p-2 text-gray-500 hover:bg-gray-100 rounded-lg md:hidden transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-semibold text-lg text-gray-900 tracking-tight">Моя База Знаний (Облако)</h1>
              <p className="text-xs text-gray-500 font-medium">Безопасный поиск по вашим документам</p>
            </div>
          </div>
          {messages.length > 0 && (
           <button onClick={clearChat} className="text-sm text-gray-500 hover:text-red-500 font-medium flex items-center gap-1 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Очистить чат</span>
           </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center mt-20">
                <div className="w-16 h-16 bg-white border border-gray-200 shadow-sm rounded-2xl flex items-center justify-center mb-6">
                  <Bot className="w-8 h-8 text-indigo-500" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Облачная база знаний</h2>
                <p className="text-sm text-gray-500 max-w-sm leading-relaxed">
                  Загружайте PDF, DOCX, Excel или текстовые файлы. Я проанализирую их с помощью модели Pro и помогу найти ответы!
                </p>
              </div>
            ) : (
              messages.map((m, idx) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={m.id || idx} 
                  className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}
                >
                  {m.role === 'assistant' && (
                    <div className="w-8 h-8 flex-shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm">
                      <Bot className="w-4 h-4 text-indigo-500" />
                    </div>
                  )}
                  <div 
                    className={`max-w-[85%] rounded-2xl px-5 py-4 ${
                      m.role === 'user' 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : 'bg-white text-gray-800 border border-gray-100 shadow-sm'
                    }`}
                  >
                    {m.role === 'user' ? (
                      <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{m.content}</p>
                    ) : (
                      <div className="markdown-body text-[15px]">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                  {m.role === 'user' && (
                    <div className="w-8 h-8 flex-shrink-0 bg-indigo-100 border border-indigo-200 rounded-full overflow-hidden shadow-sm">
                      <img src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}`} alt="you" />
                    </div>
                  )}
                </motion.div>
              ))
            )}
            {isGenerating && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex gap-4">
                <div className="w-8 h-8 flex-shrink-0 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm">
                  <Bot className="w-4 h-4 text-indigo-500" />
                </div>
                <div className="max-w-[85%] rounded-2xl px-5 py-4 bg-white text-gray-800 border border-gray-100 shadow-sm">
                  <span className="flex items-center gap-2 text-indigo-400">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></span>
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0.4s" }}></span>
                  </span>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        <div className="p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 z-10 w-full relative">
          <div className="max-w-3xl mx-auto drop-shadow-sm flex gap-3">
            <form onSubmit={handleSendMessage} className="flex-1 relative flex items-end bg-white border border-gray-300 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 overflow-hidden transition-all">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={documents.length === 0 ? "Сначала загрузите файлы ->" : "Спросите что-нибудь о ваших документах..."}
                disabled={isGenerating || documents.length === 0}
                className="w-full max-h-48 min-h-[56px] py-4 pl-4 pr-14 text-sm bg-transparent outline-none resize-none disabled:bg-gray-50 disabled:text-gray-400 text-gray-800 cursor-text"
                rows={1}
                style={{ 
                  height: inputValue.split('\n').length > 1 ? `${Math.min(120, (inputValue.split('\n').length * 20) + 36)}px` : '56px'
                }}
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || isGenerating || documents.length === 0}
                className="absolute right-2 bottom-2 w-10 h-10 flex items-center justify-center bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors shadow-sm cursor-pointer"
              >
                <Send className="w-4 h-4 translate-x-[-1px] translate-y-[1px]" />
              </button>
            </form>
          </div>
          {documents.length === 0 && (
            <div className="max-w-3xl mx-auto mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-amber-600">
              <AlertCircle className="w-3.5 h-3.5" />
              Пожалуйста, добавьте источник на боковой панели.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
