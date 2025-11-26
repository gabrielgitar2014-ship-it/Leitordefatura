import React, { useState, useEffect, useRef } from 'react';
import { Upload, Loader2, Check, Trash2, MousePointer2, Layers, ChevronDown, ChevronUp, Receipt } from 'lucide-react';

export default function App() {
  // --- STATES ---
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [visualData, setVisualData] = useState(null);
  
  const [interactionMode, setInteractionMode] = useState('scroll'); 
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [selectionBox, setSelectionBox] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  const [confirmedTransactions, setConfirmedTransactions] = useState([]);
  
  const startPos = useRef({ x: 0, y: 0 });
  const [pageScales, setPageScales] = useState({});
  const imageRefs = useRef({});
  const containerRef = useRef(null);

  // =========================================================
  // ⚡ LÓGICA DE UPLOAD (CORRIGIDA)
  // =========================================================

  // Função dedicada para processar assim que o arquivo é escolhido
  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile); // Guarda no estado
    setLoading(true);      // Ativa loading imediatamente

    const formData = new FormData();
    formData.append('file', selectedFile); // Usa o arquivo direto do evento

    try {
      const response = await fetch('http://127.0.0.1:5000/process_visual', { 
        method: 'POST', 
        body: formData 
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setVisualData(data.visual_data);
    } catch (err) {
      alert("Erro ao processar: " + err.message);
      setFile(null); // Reseta para tentar de novo
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // 🧠 LÓGICA DE SELEÇÃO E PROCESSAMENTO
  // =========================================================

  const processSelectionBox = async (boxRect, pageNum) => {
    if (!visualData || !boxRect) return;
    setProcessing(true);

    const pageMeta = visualData.text_map.find(p => p.page === pageNum);
    const currentScale = pageScales[pageNum];
    const imgRect = imageRefs.current[pageNum].getBoundingClientRect();

    const relativeBox = {
      x0: (boxRect.x - imgRect.left) / currentScale,
      top: (boxRect.y - imgRect.top) / currentScale,
      x1: (boxRect.x + boxRect.width - imgRect.left) / currentScale,
      bottom: (boxRect.y + boxRect.height - imgRect.top) / currentScale
    };

    const selectedWords = pageMeta.words.filter(word => {
      const wCx = word.x0 + (word.x1 - word.x0) / 2;
      const wCy = word.top + (word.bottom - word.top) / 2;
      return (wCx >= relativeBox.x0 && wCx <= relativeBox.x1 && wCy >= relativeBox.top && wCy <= relativeBox.bottom);
    });

    if (selectedWords.length === 0) { setProcessing(false); return; }

    try {
        const response = await fetch('http://127.0.0.1:5000/parse_selection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: selectedWords })
        });
        const data = await response.json();

        if (data.transactions?.length > 0) {
            setConfirmedTransactions(prev => [...prev, ...data.transactions]);
            setIsBottomSheetOpen(true); // Abre a gaveta para mostrar o sucesso
            setInteractionMode('scroll'); // Volta pro scroll pra facilitar
        }
    } catch (err) { console.error(err); } 
    finally { setProcessing(false); }
  };

  // --- GESTORES DE EVENTOS ---
  const handlePointerDown = (e, pageNum) => {
    if (interactionMode === 'scroll') return;
    e.preventDefault(); 
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setIsDrawing(true);
    startPos.current = { x: clientX, y: clientY };
    setSelectionBox({ x: clientX, y: clientY, width: 0, height: 0, page: pageNum });
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const width = clientX - startPos.current.x;
    const height = clientY - startPos.current.y;
    setSelectionBox(prev => ({ ...prev, width: Math.abs(width), height: Math.abs(height), x: width > 0 ? startPos.current.x : clientX, y: height > 0 ? startPos.current.y : clientY }));
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (selectionBox && selectionBox.width > 10 && selectionBox.height > 10) {
        processSelectionBox(selectionBox, selectionBox.page);
    }
    setSelectionBox(null);
  };

  // --- ESCALA ---
  const updateScales = () => {
    if (!visualData) return;
    const newScales = {};
    visualData.images.forEach((img) => {
      const el = imageRefs.current[img.page];
      const meta = visualData.text_map.find(p => p.page === img.page);
      if (el && meta) newScales[img.page] = el.offsetWidth / meta.width;
    });
    setPageScales(newScales);
  };
  useEffect(() => { window.addEventListener('resize', updateScales); return () => window.removeEventListener('resize', updateScales); }, [visualData]);


  // =========================================================
  // 🎨 RENDERIZAÇÃO
  // =========================================================

  // TELA DE UPLOAD (CORRIGIDA: Auto-Envio)
  if (!visualData) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-8 animate-in fade-in duration-700">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-50 rounded-3xl mb-4 shadow-sm">
            <Receipt className="w-10 h-10 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">FinanSmart</h1>
            <p className="text-slate-500 mt-2">Auditoria Visual Inteligente</p>
          </div>
          
          {/* BOTÃO DE UPLOAD INTELIGENTE */}
          <label className={`block group relative cursor-pointer ${loading ? 'pointer-events-none opacity-80' : ''}`}>
            <div className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 transition-all group-hover:scale-[1.02] group-active:scale-95 flex items-center justify-center gap-3">
               {loading ? (
                 <><Loader2 className="animate-spin w-5 h-5" /> Processando Fatura...</>
               ) : (
                 <><Upload className="w-5 h-5" /> Carregar Fatura</>
               )}
            </div>
            {/* O input agora chama handleFileSelect que faz o upload AUTOMÁTICO */}
            <input 
              type="file" 
              accept="application/pdf" 
              onChange={handleFileSelect} 
              className="hidden" 
              disabled={loading}
            />
          </label>
        </div>
      </div>
    );
  }

  // CALCULO DO TOTAL
  const totalValue = confirmedTransactions.reduce((acc, cur) => { 
    const v = parseFloat(cur.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()); 
    return acc + (isNaN(v) ? 0 : v); 
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans selection:bg-indigo-100">
      
      {/* 1. BARRA DE FERRAMENTAS (TOPO) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-1.5 bg-white/90 backdrop-blur-lg shadow-lg border border-slate-200 rounded-full transition-all scale-90 sm:scale-100">
        <button 
          onClick={() => setInteractionMode('scroll')} 
          className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${interactionMode === 'scroll' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <MousePointer2 className="w-4 h-4" /> <span className="hidden sm:inline">Navegar</span>
        </button>
        <button 
          onClick={() => setInteractionMode('draw')} 
          className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${interactionMode === 'draw' ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <Layers className="w-4 h-4" /> <span className="hidden sm:inline">Selecionar</span>
        </button>
      </div>

      {/* 2. ÁREA DA FATURA */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-y-auto bg-slate-100 relative ${interactionMode === 'draw' ? 'touch-none cursor-crosshair' : 'touch-pan-y cursor-grab'}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
      >
        {/* LOADING INDICATOR */}
        {processing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/30 backdrop-blur-[2px]">
             <div className="bg-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-slate-100 animate-bounce">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                <span className="text-sm font-bold text-slate-700">Extraindo dados...</span>
             </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto py-24 px-2 md:px-6 space-y-6">
          {visualData.images.map((imgPage) => (
            <div key={imgPage.page} className="relative shadow-xl bg-white rounded-lg overflow-hidden ring-1 ring-black/5 transition-shadow select-none" onPointerDown={(e) => handlePointerDown(e, imgPage.page)}>
              <img ref={el => imageRefs.current[imgPage.page] = el} src={imgPage.base64} className="w-full h-auto pointer-events-none block" onLoad={updateScales} />
            </div>
          ))}
        </div>

        {selectionBox && (
          <div className="fixed border-2 border-indigo-500 bg-indigo-500/20 z-50 pointer-events-none rounded backdrop-blur-[1px] transition-all" 
               style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />
        )}
      </div>

      {/* 3. GAVETA DE DADOS (BOTTOM SHEET) */}
      <div className={`bg-white z-40 border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col ${isBottomSheetOpen ? 'h-[60vh]' : 'h-[90px]'}`}>
        
        {/* Header da Gaveta */}
        <div onClick={() => setIsBottomSheetOpen(!isBottomSheetOpen)} className="px-6 h-[90px] flex items-center justify-between cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Auditado</span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
              </span>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                {confirmedTransactions.length} itens
              </span>
            </div>
          </div>
          <button className="p-2 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-all">
            {isBottomSheetOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 bg-slate-50/50">
          {confirmedTransactions.length === 0 && isBottomSheetOpen && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">
              <Layers className="w-12 h-12 mb-2 text-slate-300" />
              <p className="text-sm">Desenhe caixas na fatura para extrair.</p>
            </div>
          )}

          {confirmedTransactions.map((tx) => (
            <div key={tx.id} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex flex-col min-w-0 gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{tx.date || 'S/D'}</span>
                  {tx.installment && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">{tx.installment}</span>}
                </div>
                <span className="text-sm font-semibold text-slate-700 truncate">{tx.description}</span>
              </div>
              <div className="flex items-center gap-3 pl-2 border-l border-slate-100">
                <span className="text-sm font-bold text-slate-900">R$ {tx.value}</span>
                <button onClick={(e) => { e.stopPropagation(); setConfirmedTransactions(prev => prev.filter(t => t.id !== tx.id)); }} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>

        {/* Botão Concluir */}
        {isBottomSheetOpen && (
          <div className="p-4 bg-white border-t border-slate-100">
             <button className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50" disabled={confirmedTransactions.length === 0}>
               <Check className="w-5 h-5" /> CONCLUIR AUDITORIA
             </button>
          </div>
        )}
      </div>

    </div>
  );
}