import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Loader2, Check, Trash2, MousePointer2, Layers, 
  ChevronDown, ChevronUp, Receipt, Sparkles, ArrowLeft, Save, Edit3 
} from 'lucide-react';

export default function App() {
  // --- STATES ---
  const [view, setView] = useState('audit'); // 'audit' | 'review'
  
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [visualData, setVisualData] = useState(null);
  
  const [interactionMode, setInteractionMode] = useState('scroll'); 
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  
  const [selectionBox, setSelectionBox] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Lista Principal de Dados
  const [confirmedTransactions, setConfirmedTransactions] = useState([]);
  
  const startPos = useRef({ x: 0, y: 0 });
  const [pageScales, setPageScales] = useState({});
  const imageRefs = useRef({});
  const containerRef = useRef(null);

  // =========================================================
  // LÓGICA DE PROCESSO (MANTIDA IGUAL)
  // =========================================================

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setLoading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('http://127.0.0.1:5000/process_auto_audit', { method: 'POST', body: formData });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setVisualData(data.visual_data);
      
      if (data.visual_data.auto_transactions) {
        setConfirmedTransactions(data.visual_data.auto_transactions);
        setIsBottomSheetOpen(true);
      }
    } catch (err) {
      alert("Erro: " + err.message);
      setFile(null);
    } finally { setLoading(false); }
  };

  const processManualSelection = async (boxRect, pageNum) => {
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
            setInteractionMode('scroll'); 
        }
    } catch (err) { console.error(err); } 
    finally { setProcessing(false); }
  };

  // --- EVENTOS MOUSE/TOUCH ---
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
    if (selectionBox && selectionBox.width > 10 && selectionBox.height > 10) processManualSelection(selectionBox, selectionBox.page);
    setSelectionBox(null);
  };

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

  // --- FUNÇÕES DE EDIÇÃO NA TELA DE REVIEW ---
  const updateTransaction = (id, field, value) => {
    setConfirmedTransactions(prev => prev.map(tx => 
      tx.id === id ? { ...tx, [field]: value } : tx
    ));
  };

  const deleteTransaction = (id) => {
    setConfirmedTransactions(prev => prev.filter(tx => tx.id !== id));
  };

  // Calculo Total
  const totalValue = confirmedTransactions.reduce((acc, cur) => { 
    const v = parseFloat(cur.value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()); 
    return acc + (isNaN(v) ? 0 : v); 
  }, 0);


  // =========================================================
  // 🖥️ VIEW 1: TELA DE REVISÃO FINAL (NOVA)
  // =========================================================
  if (view === 'review') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Header */}
        <div className="bg-white px-6 py-5 border-b border-slate-200 sticky top-0 z-20 shadow-sm">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <button onClick={() => setView('audit')} className="flex items-center text-slate-500 hover:text-indigo-600 transition-colors gap-1 font-medium text-sm">
              <ArrowLeft className="w-4 h-4" /> Voltar para Fatura
            </button>
            <h1 className="text-lg font-bold text-slate-800">Revisão Final</h1>
            <div className="w-16"></div> {/* Espaçador */}
          </div>
        </div>

        {/* Lista de Cards */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto space-y-4">
            
            {/* Resumo */}
            <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-6 flex justify-between items-center">
              <div>
                <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider">Valor Total Aprovado</p>
                <h2 className="text-3xl font-bold mt-1">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{confirmedTransactions.length}</p>
                <p className="text-indigo-200 text-xs">Transações</p>
              </div>
            </div>

            {/* Lista Editável */}
            {confirmedTransactions.map((tx) => (
              <div key={tx.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow group flex flex-col md:flex-row gap-4 items-start md:items-center">
                
                {/* Data e Parcela */}
                <div className="flex md:flex-col items-center md:items-start gap-2 min-w-[80px]">
                  <input 
                    value={tx.date} 
                    onChange={(e) => updateTransaction(tx.id, 'date', e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold px-2 py-1.5 rounded text-center w-20 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  {tx.installment && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-bold border border-amber-100">
                      {tx.installment}
                    </span>
                  )}
                </div>

                {/* Descrição (Editável) */}
                <div className="flex-1 w-full relative">
                  <div className="absolute top-2.5 left-3 text-slate-300">
                    <Edit3 className="w-3.5 h-3.5" />
                  </div>
                  <input 
                    value={tx.description}
                    onChange={(e) => updateTransaction(tx.id, 'description', e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm font-semibold text-slate-700 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white bg-slate-50 rounded-lg transition-all outline-none"
                  />
                </div>

                {/* Valor e Ações */}
                <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                    <input 
                      value={tx.value.replace('R$', '').trim()}
                      onChange={(e) => updateTransaction(tx.id, 'value', e.target.value)}
                      className="w-28 pl-8 pr-3 py-2 text-right text-sm font-bold text-slate-900 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  
                  <button 
                    onClick={() => deleteTransaction(tx.id)}
                    className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

              </div>
            ))}

          </div>
        </div>

        {/* Footer Fixo */}
        <div className="bg-white border-t border-slate-200 p-4 md:p-6 sticky bottom-0 z-20">
          <div className="max-w-3xl mx-auto">
            <button 
              onClick={() => alert("JSON final pronto para salvar no Supabase!")}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-2 transition-transform active:scale-[0.99]"
            >
              <Save className="w-5 h-5" /> SALVAR TUDO NO BANCO
            </button>
          </div>
        </div>
      </div>
    );
  }


  // =========================================================
  // 🖥️ VIEW 2: TELA DE UPLOAD E AUDITORIA (VISUAL)
  // =========================================================

  if (!visualData) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-8 animate-in fade-in duration-700">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-indigo-50 rounded-full mb-4 shadow-sm ring-8 ring-indigo-50/50">
            <Sparkles className="w-10 h-10 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Auto Auditor</h1>
            <p className="text-slate-500 mt-2 text-lg">IA Generativa + Visão Computacional</p>
          </div>
          <label className={`block group relative cursor-pointer ${loading ? 'pointer-events-none opacity-80' : ''}`}>
            <div className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl shadow-xl shadow-slate-300 transition-all group-hover:scale-[1.02] group-active:scale-95 flex items-center justify-center gap-3">
               {loading ? <><Loader2 className="animate-spin w-5 h-5" /> Analisando...</> : <><Upload className="w-5 h-5" /> Carregar PDF</>}
            </div>
            <input type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" disabled={loading}/>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans selection:bg-indigo-100">
      {/* Barra de Ferramentas */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-1.5 bg-white/90 backdrop-blur-lg shadow-lg border border-slate-200 rounded-full transition-all scale-90 sm:scale-100">
        <button onClick={() => setInteractionMode('scroll')} className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${interactionMode === 'scroll' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
          <MousePointer2 className="w-4 h-4" /> Navegar
        </button>
        <button onClick={() => setInteractionMode('draw')} className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${interactionMode === 'draw' ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-100' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Layers className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {/* Área da Fatura */}
      <div ref={containerRef} className={`flex-1 overflow-y-auto bg-slate-100 relative ${interactionMode === 'draw' ? 'touch-none cursor-crosshair' : 'touch-pan-y cursor-grab'}`} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onMouseLeave={handlePointerUp}>
        {processing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/30 backdrop-blur-[2px]">
             <div className="bg-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-slate-100 animate-bounce">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                <span className="text-sm font-bold text-slate-700">Processando...</span>
             </div>
          </div>
        )}
        <div className="max-w-3xl mx-auto py-24 px-2 md:px-6 space-y-6">
          {visualData.images.map((imgPage) => (
            <div key={imgPage.page} className="relative shadow-xl bg-white rounded-lg overflow-hidden ring-1 ring-black/5 transition-shadow select-none" onPointerDown={(e) => handlePointerDown(e, imgPage.page)}>
              <img ref={el => imageRefs.current[imgPage.page] = el} src={imgPage.base64} className="w-full h-auto pointer-events-none block" onLoad={updateScales} />
              {/* Caixas Verdes */}
              {confirmedTransactions
                .filter(tx => tx.box && tx.box.page === imgPage.page)
                .map(tx => (
                  <div
                    key={tx.id}
                    className="absolute bg-green-500/20 border-2 border-green-500 cursor-pointer hover:bg-red-500/40 hover:border-red-500 transition-colors z-20 rounded-sm group"
                    style={{ left: tx.box.x0 * (pageScales[imgPage.page]||1), top: tx.box.top * (pageScales[imgPage.page]||1), width: (tx.box.x1 - tx.box.x0) * (pageScales[imgPage.page]||1), height: (tx.box.bottom - tx.box.top) * (pageScales[imgPage.page]||1) }}
                    onClick={(e) => { e.stopPropagation(); setConfirmedTransactions(prev => prev.filter(t => t.id !== tx.id)); }}
                  >
                    <div className="hidden group-hover:flex items-center justify-center w-full h-full"><Trash2 className="w-4 h-4 text-white drop-shadow-md" /></div>
                  </div>
                ))
              }
            </div>
          ))}
        </div>
        {selectionBox && <div className="fixed border-2 border-indigo-500 bg-indigo-500/20 z-50 pointer-events-none rounded backdrop-blur-[1px]" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />}
      </div>

      {/* Bottom Sheet (Resumo Rápido) */}
      <div className={`bg-white z-40 border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] flex flex-col h-[90px]`}>
        <div className="px-6 h-full flex items-center justify-between bg-white">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Auditado</span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
              </span>
              <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100">
                {confirmedTransactions.length} itens
              </span>
            </div>
          </div>
          
          {/* BOTÃO MUDANÇA DE TELA */}
          <button 
            onClick={() => setView('review')}
            disabled={confirmedTransactions.length === 0}
            className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Revisar & Salvar <ArrowLeft className="w-4 h-4 rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}
