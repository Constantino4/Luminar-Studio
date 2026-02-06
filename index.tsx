
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// === UTILS ===
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const App = () => {
  const [view, setView] = useState<'scan' | 'create' | 'edit' | 'animate' | 'history'>('scan');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [imageIn, setImageIn] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Esconde o loader do HTML imediatamente quando o React montar
    const loader = document.getElementById('loading-screen');
    if (loader) loader.style.display = 'none';
    
    // Carrega histórico do localStorage
    const saved = localStorage.getItem('lumina_v5_data');
    if (saved) setHistory(JSON.parse(saved));
  }, []);

  const saveHistory = (item: any) => {
    const updated = [{ ...item, id: Date.now(), date: new Date().toLocaleString() }, ...history].slice(0, 20);
    setHistory(updated);
    localStorage.setItem('lumina_v5_data', JSON.stringify(updated));
  };

  const executeAI = async () => {
    // @ts-ignore
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      return;
    }

    setLoading(true);
    setStatus("Sincronizando com a Rede Neural...");
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

    try {
      if (view === 'scan' && imageIn) {
        setStatus("Analisando Composição...");
        const res = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: imageIn.split(',')[1], mimeType: 'image/png' } },
              { text: "Analise a comida: calorias, macros (proteína, carbo, gordura) e score (0-100). JSON output." }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                cal: { type: Type.NUMBER },
                p: { type: Type.NUMBER },
                c: { type: Type.NUMBER },
                f: { type: Type.NUMBER },
                score: { type: Type.NUMBER }
              }
            }
          }
        });
        const data = JSON.parse(res.text!);
        setResult(data);
        saveHistory({ type: 'SCAN', img: imageIn, data });
      }

      if (view === 'create' && prompt) {
        setStatus("Gerando Imagem...");
        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: prompt }] }
        });
        const part = res.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) {
          const url = `data:image/png;base64,${part.inlineData.data}`;
          setResult({ url });
          saveHistory({ type: 'GEN', img: url, prompt });
        }
      }

      if (view === 'edit' && imageIn && prompt) {
        setStatus("Editando Imagem...");
        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { data: imageIn.split(',')[1], mimeType: 'image/png' } },
              { text: prompt }
            ]
          }
        });
        const part = res.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) {
          const url = `data:image/png;base64,${part.inlineData.data}`;
          setResult({ url });
          saveHistory({ type: 'EDIT', img: url, prompt });
        }
      }

      if (view === 'animate' && imageIn) {
        setStatus("Renderizando Vídeo (Veo 3.1)...");
        let op = await ai.models.generateVideos({
          model: 'veo-3.1-fast-generate-preview',
          image: { imageBytes: imageIn.split(',')[1], mimeType: 'image/png' },
          prompt: prompt || "Cinematic flow",
          config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
        });
        while (!op.done) {
          await new Promise(r => setTimeout(r, 10000));
          op = await ai.operations.getVideosOperation({ operation: op });
        }
        const uri = op.response?.generatedVideos?.[0]?.video?.uri;
        const resp = await fetch(`${uri}&key=${process.env.API_KEY}`);
        const blob = await resp.blob();
        const videoUrl = URL.createObjectURL(blob);
        setResult({ video: videoUrl });
        saveHistory({ type: 'ANIM', img: imageIn, video: videoUrl });
      }

    } catch (e: any) {
      if (e.message?.includes("403") || e.message?.includes("permission")) {
        alert("Erro de Permissão: Selecione uma chave de API válida.");
        // @ts-ignore
        await window.aistudio.openSelectKey();
      } else {
        alert("Erro: " + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const b64 = await fileToBase64(file);
      setImageIn(`data:${file.type};base64,${b64}`);
      setResult(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30">
      <header className="fixed top-0 inset-x-0 z-50 glass px-6 py-4 flex justify-between items-center border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center font-black text-slate-950 italic">L</div>
          <h1 className="font-black uppercase tracking-tighter text-lg">Lumina <span className="text-emerald-500">Studio</span></h1>
        </div>
        <button 
          onClick={() => { // @ts-ignore
            window.aistudio.openSelectKey(); }}
          className="text-[9px] font-black uppercase tracking-widest bg-white/5 px-4 py-2 rounded-xl border border-white/10 text-emerald-500 hover:bg-emerald-500/10 transition-all"
        >
          API KEY
        </button>
      </header>

      <main className="flex-1 pt-24 pb-36 px-6 max-w-xl mx-auto w-full space-y-8 animate-up">
        <h2 className="text-3xl font-black uppercase tracking-tighter">
          {view === 'scan' && <span className="text-emerald-400">Scanner Nutri</span>}
          {view === 'create' && <span className="text-purple-400">Criar Arte</span>}
          {view === 'edit' && <span className="text-blue-400">Editor IA</span>}
          {view === 'animate' && <span className="text-orange-400">Animar Foto</span>}
          {view === 'history' && <span className="text-slate-500">Arquivos</span>}
        </h2>

        {view !== 'create' && view !== 'history' && (
          <div onClick={() => fileRef.current?.click()} className="h-72 w-full glass rounded-[2.5rem] flex items-center justify-center overflow-hidden border-2 border-dashed border-white/10 active:scale-95 transition-all cursor-pointer shadow-inner">
            {imageIn ? <img src={imageIn} className="w-full h-full object-cover" /> : <div className="text-center opacity-30"><p className="text-[10px] font-black uppercase tracking-widest">Toque para selecionar imagem</p></div>}
          </div>
        )}

        {view !== 'history' && (
          <div className="space-y-6">
            {(view === 'create' || view === 'edit' || view === 'animate') && (
              <textarea 
                value={prompt} 
                onChange={e => setPrompt(e.target.value)}
                placeholder="O que a IA deve fazer?..."
                className="w-full bg-slate-900 border border-white/10 rounded-3xl p-6 text-sm outline-none focus:border-emerald-500/50 min-h-[120px] transition-all"
              />
            )}
            <button 
              onClick={executeAI}
              disabled={loading || (view !== 'create' && !imageIn)}
              className="w-full py-5 bg-emerald-500 rounded-2xl font-black uppercase tracking-widest text-slate-950 text-xs shadow-xl active:scale-95 transition-all disabled:opacity-30"
            >
              {loading ? 'Processando...' : 'Ativar IA'}
            </button>
          </div>
        )}

        {result && view !== 'history' && (
          <div className="space-y-6 animate-up">
            <div className="h-[1px] bg-white/5 w-full"></div>
            {result.url && <img src={result.url} className="w-full rounded-[2.5rem] shadow-2xl border border-white/10" />}
            {result.video && <video src={result.video} controls autoPlay loop className="w-full rounded-[2.5rem] shadow-2xl border border-white/10" />}
            {result.cal && (
              <div className="glass p-8 rounded-[2.5rem] space-y-6">
                <div className="flex justify-between items-end border-b border-white/5 pb-4">
                  <h3 className="text-5xl font-black">{result.cal} <span className="text-sm text-emerald-500 uppercase">Kcal</span></h3>
                  <p className="text-3xl font-black text-emerald-400">{result.score}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[ ['P', result.p, 'blue'], ['C', result.c, 'orange'], ['G', result.f, 'yellow'] ].map(([l, v, c]) => (
                    <div key={l as string} className="bg-white/5 p-4 rounded-2xl border border-white/5">
                      <p className={`text-[9px] font-black uppercase text-${c as string}-400 mb-1`}>{l as string}</p>
                      <p className="text-lg font-bold">{v as string}g</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'history' && (
          <div className="grid grid-cols-2 gap-4">
            {history.length === 0 ? <p className="col-span-2 text-center py-20 opacity-30 text-[10px] uppercase font-black">Histórico Vazio</p> : history.map(h => (
              <div key={h.id} className="glass rounded-3xl overflow-hidden aspect-square relative group border border-white/5">
                <img src={h.img} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col justify-end p-3">
                  <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">{h.type}</p>
                  <p className="text-[10px] text-slate-400 truncate italic">{h.prompt || h.date}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-2 bg-slate-900/90 backdrop-blur-3xl rounded-[2.2rem] border border-white/10 shadow-2xl">
        {[
          {id:'scan', l:'Scan'}, {id:'create', l:'Criar'}, {id:'edit', l:'Edit'}, {id:'animate', l:'Vídeo'}, {id:'history', l:'Hist'}
        ].map(n => (
          <button 
            key={n.id} 
            onClick={() => { setView(n.id as any); setResult(null); setImageIn(null); setPrompt(''); }}
            className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${view === n.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-200'}`}
          >
            {n.l}
          </button>
        ))}
      </nav>

      {loading && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center animate-up">
          <div className="loader-ring mb-6"></div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400 animate-pulse">{status}</p>
        </div>
      )}

      <input type="file" ref={fileRef} className="hidden" accept="image/*" onChange={handleFile} />
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
