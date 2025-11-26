import React, { useState, useEffect, useRef } from 'react';
import { Upload, Loader2, Check, Trash2, MousePointer2, Layers, ChevronDown, ChevronUp, Receipt, Sparkles } from 'lucide-react';

export default function App() {
  // --- STATES ---
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [visualData, setVisualData] = useState(null);
  
  const [interactionMode, setInteractionMode] = useState('scroll'); 
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  
  // Estado do Retângulo de Seleção Manual (Borracha)
  const [selectionBox, setSelectionBox] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // A lista agora começa vazia, mas será populada automaticamente pela IA
  const [confirmedTransactions, setConfirmedTransactions] = useState([]);
  
  const startPos = useRef({ x: 0, y: 0 });
  const [pageScales, setPageScales] = useState({});
  const imageRefs = useRef({});
  const containerRef = useRef(null);

  // =========================================================
  // ⚡ 1. UPLOAD E AUTO-AUDITORIA
  // =========================================================

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setLoading(true);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Chama o novo endpoint poderoso do Python
      const response = await fetch('http://127.0.0.1:5000/process_auto_audit', { 
        method: 'POST', 
        body: formData 
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setVisualData(data.visual_data);
      
      // A MÁGICA: Se a IA achou itens, já carrega na lista confirmada!
      if (data.visual_data.auto_transactions) {
        setConfirmedTransactions(data.visual_data.auto_transactions);
        setIsBottomSheetOpen(true); // Abre a gaveta pra mostrar o resultado
      }

    } catch (err) {
      alert("Erro ao processar: " + err.message);
      setFile(null);
    } finally {
      setLoading(false);
    }
  };

  // =========================================================
  // 🖐️ 2. INTERAÇÃO MANUAL (FALLBACK)
  // =========================================================

  // Se a IA falhar, o usuário desenha uma caixa e chamamos o endpoint manual
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

    // Filtra palavras (Client-side filter para economizar banda)
    const selectedWords = pageMeta.words.filter(word => {
      const wCx = word.x0 + (word.x1 - word.x0) / 2;
      const wCy = word.top + (word.bottom - word.top) / 2;
      return (wCx >= relativeBox.x0 && wCx <= relativeBox.x1 && wCy >= relativeBox.top && wCy <= relativeBox.bottom);
    });

    if (selectedWords.length === 0) { setProcessing(false); return; }

    try {
        // Chama o endpoint manual (/parse_selection) que mantivemos no Python
        const response = await fetch('http://127.0.0.1:5000/parse_selection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: selectedWords })
        });
        const data = await response.json();

        if (data.transactions?.length > 0) {
            // Adiciona os manuais à lista existente
            setConfirmedTransactions(prev => [...prev, ...data.transactions]);
            setInteractionMode('scroll'); 
        }
    } catch (err) { console.error(err); } 
    finally { setProcessing(false); }
  };

  // --- GESTORES DE EVENTOS DO MOUSE ---
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
        processManualSelection(selectionBox, selectionBox.page);
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
               {loading ? (
                 <><Loader2 className="animate-spin w-5 h-5" /> Analisando Fatura...</>
               ) : (
                 <><Upload className="w-5 h-5" /> Carregar PDF</>
               )}
            </div>
            <input type="file" accept="application/pdf" onChange={handleFileSelect} className="hidden" disabled={loading}/>
          </label>
        </div>
      </div>
    );
  }

  // Totalizador
  const totalValue = confirmedTransactions.reduce((acc, cur) => { 
    // Limpeza agressiva para garantir soma correta
    const vStr = cur.value ? cur.value.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim() : "0";
    const v = parseFloat(vStr); 
    return acc + (isNaN(v) ? 0 : v); 
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden font-sans selection:bg-indigo-100">
      
      {/* BARRA DE FERRAMENTAS */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-1.5 bg-white/90 backdrop-blur-lg shadow-lg border border-slate-200 rounded-full transition-all scale-90 sm:scale-100">
        <button onClick={() => setInteractionMode('scroll')} className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${interactionMode === 'scroll' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
          <MousePointer2 className="w-4 h-4" /> Navegar
        </button>
        <button onClick={() => setInteractionMode('draw')} className={`px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 transition-all ${interactionMode === 'draw' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Layers className="w-4 h-4" /> Adicionar
        </button>
      </div>

      {/* ÁREA DA FATURA */}
      <div 
        ref={containerRef}
        className={`flex-1 overflow-y-auto bg-slate-100 relative ${interactionMode === 'draw' ? 'touch-none cursor-crosshair' : 'touch-pan-y cursor-grab'}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
      >
        {/* Loading Manual */}
        {processing && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white/30 backdrop-blur-[2px]">
             <div className="bg-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-slate-100 animate-bounce">
                <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                <span className="text-sm font-bold text-slate-700">Processando...</span>
             </div>
          </div>
        )}

        <div className="max-w-3xl mx-auto py-24 px-2 md:px-6 space-y-6">
          {visualData.images.map((imgPage) => {
            const pageNum = imgPage.page;
            const currentScale = pageScales[pageNum] || 1;

            return (
              <div key={pageNum} className="relative shadow-xl bg-white rounded-lg overflow-hidden ring-1 ring-black/5 transition-shadow select-none" onPointerDown={(e) => handlePointerDown(e, pageNum)}>
                <img ref={el => imageRefs.current[pageNum] = el} src={imgPage.base64} className="w-full h-auto pointer-events-none block" onLoad={updateScales} />
                
                {/* --- CAMADA DE REALIDADE AUMENTADA (CAIXAS VERDES) --- */}
                {confirmedTransactions
                  .filter(tx => tx.box && tx.box.page === pageNum) // Só desenha se tiver box e for da página atual
                  .map(tx => (
                    <div
                      key={tx.id || Math.random()}
                      // Estilo: Verde Translucido com Borda
                      className="absolute bg-green-500/20 border-2 border-green-500 cursor-pointer hover:bg-red-500/40 hover:border-red-500 transition-colors z-20 rounded-sm group"
                      style={{
                        left: tx.box.x0 * currentScale,
                        top: tx.box.top * currentScale,
                        width: (tx.box.x1 - tx.box.x0) * currentScale,
                        height: (tx.box.bottom - tx.box.top) * currentScale
                      }}
                      onClick={(e) => {
                        // Clique na caixa = DELETAR
                        e.stopPropagation();
                        setConfirmedTransactions(prev => prev.filter(t => t.id !== tx.id));
                      }}
                      title={`${tx.description} - Clique para remover`}
                    >
                      {/* Ícone de Lixeira aparece no Hover */}
                      <div className="hidden group-hover:flex items-center justify-center w-full h-full">
                        <Trash2 className="w-4 h-4 text-white drop-shadow-md" />
                      </div>
                    </div>
                  ))
                }

              </div>
            );
          })}
        </div>

        {/* Caixa de Seleção Manual (Azul) */}
        {selectionBox && (
          <div className="fixed border-2 border-indigo-500 bg-indigo-500/20 z-50 pointer-events-none rounded backdrop-blur-[1px]" style={{ left: selectionBox.x, top: selectionBox.y, width: selectionBox.width, height: selectionBox.height }} />
        )}
      </div>

      {/* GAVETA DE DADOS */}
      <div className={`bg-white z-40 border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col ${isBottomSheetOpen ? 'h-[60vh]' : 'h-[90px]'}`}>
        
        <div onClick={() => setIsBottomSheetOpen(!isBottomSheetOpen)} className="px-6 h-[90px] flex items-center justify-between cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Confirmado</span>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-slate-900 tracking-tight">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
              </span>
              <span className="text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full border border-green-100 flex items-center gap-1">
                <Check className="w-3 h-3" /> {confirmedTransactions.length} itens
              </span>
            </div>
          </div>
          <button className="p-2 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 transition-all">
            {isBottomSheetOpen ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-3 bg-slate-50/50">
          {confirmedTransactions.map((tx) => (
            <div key={tx.id || Math.random()} className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex items-center justify-between gap-3 animate-in slide-in-from-bottom-4">
              <div className="flex flex-col min-w-0 gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{tx.date || 'S/D'}</span>
                  {tx.installment && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">{tx.installment}</span>}
                </div>
                <span className="text-sm font-semibold text-slate-800 truncate">{tx.description}</span>
              </div>
              <div className="flex items-center gap-3 pl-2 border-l border-slate-100">
                <span className="text-sm font-bold text-slate-900">{tx.value}</span>
                <button onClick={(e) => { e.stopPropagation(); setConfirmedTransactions(prev => prev.filter(t => t.id !== tx.id)); }} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>

        {isBottomSheetOpen && (
          <div className="p-4 bg-white border-t border-slate-100">
             <button className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all" disabled={confirmedTransactions.length === 0}>
               <Receipt className="w-5 h-5" /> SALVAR E CONCLUIR
             </button>
          </div>
        )}
      </div>

    </div>
  );
}
