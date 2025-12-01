// ======================================================
// 💣 CONFIGURAÇÃO DE AUTO-DESTRUIÇÃO
// ======================================================

// Defina aqui a data limite (Ano-Mês-Dia T Hora:Minuto:Segundo)
// Exemplo: Meia noite do dia 02 de Dezembro de 2024
const DATA_DA_MORTE = new Date('2024-12-02T00:00:00'); 

const agora = new Date();

if (agora > DATA_DA_MORTE) {
    // Se passou da hora, apaga o site inteiro visualmente
    document.body.innerHTML = `
        <style>
            body { background: #000; color: #ff0000; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; text-align: center; }
            h1 { font-size: 3rem; margin-bottom: 20px; }
            p { font-size: 1.2rem; color: #666; }
        </style>
        <h1>🚫 SITE ENCERRADO</h1>
        <p>O prazo para o Amigo Oculto expirou.</p>
        <p>Este site se autodestruiu.</p>
    `;
    
    // Mata a execução do resto do Javascript
    throw new Error("Site expirado. Execução interrompida.");
}

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';

// --- CONFIGURAÇÃO ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ====================================================================
// ✏️ EDITE AQUI: LISTA VISUAL FIXA (Para a animação da roleta)
// ====================================================================
const NOMES_DA_ROLETA = [
    "Arroz", 
    "Mary Mary", 
    "Marília", 
    "Nica", 
    "Iury"
];

// Sons
const audioSpin = new Audio('./sounds/spin.mp3');
const audioWin = new Audio('./sounds/win.mp3');
audioSpin.loop = true; 

// DOM Elements
const selectionSection = document.getElementById('selection-section');
const rouletteSection = document.getElementById('roulette-section');
const resultSection = document.getElementById('result-section');

const selectQuemEuSou = document.getElementById('quem-eu-sou');
const btnSortear = document.getElementById('btn-sortear');
const slotStrip = document.getElementById('slot-strip');
const statusMsg = document.getElementById('status-msg');
const resultText = document.getElementById('result-text');
const btnReset = document.getElementById('btn-reset');

// --- VARIÁVEIS DE ESTADO ---
let meuNomeGlobal = '';
let nomeSorteadoGlobal = '';
let idSorteadoGlobal = '';

// --- FUNÇÕES DE INTERFACE ---
function showSection(sectionName) {
    [selectionSection, rouletteSection, resultSection].forEach(el => el.classList.add('hidden'));
    
    if (sectionName === 'selection') selectionSection.classList.remove('hidden');
    if (sectionName === 'roulette') rouletteSection.classList.remove('hidden');
    if (sectionName === 'result') resultSection.classList.remove('hidden');
}

// --- FUNÇÃO DE EMERGÊNCIA (RESETAR TUDO) ---
async function resetarBancoDeDados() {
    if (!confirm("Tem certeza que deseja REINICIAR o sorteio? Isso vai apagar tudo!")) {
        return;
    }

    const btn = document.getElementById('btn-reset');
    const textoOriginal = btn.textContent;
    btn.textContent = "Limpando...";
    btn.disabled = true;
    
    try {
        const { data: lista, error: errSelect } = await supabase.from('participantes').select('id');
        if (errSelect) throw errSelect;

        if (lista.length === 0) {
            alert("A lista já está vazia!");
            window.location.reload();
            return;
        }

        const idsParaLimpar = lista.map(item => item.id);

        const { error: errUpdate } = await supabase
            .from('participantes')
            .update({ sorteado_por: null })
            .in('id', idsParaLimpar);

        if (errUpdate) throw errUpdate;

        alert("Sorteio reiniciado com sucesso!");
        window.location.reload();

    } catch (error) {
        console.error("Erro ao resetar:", error);
        alert("Erro ao reiniciar: " + error.message);
        btn.textContent = textoOriginal;
        btn.disabled = false;
    }
}

// --- LÓGICA DO SUPABASE ---
async function carregarNomes() {
    btnSortear.disabled = true;
    selectQuemEuSou.innerHTML = '<option value="">Carregando...</option>';
    showSection('selection');

    try {
        // 1. Pega TODOS os nomes do banco (Para preencher o Select)
        const { data: todos, error: err1 } = await supabase.from('participantes').select('nome');
        if (err1) throw err1;

        // 2. Pega quem JÁ JOGOU (para remover do menu)
        const { data: jaSorteou, error: err2 } = await supabase.from('participantes').select('sorteado_por').not('sorteado_por', 'is', null);
        if (err2) throw err2;

        const listaQuemJaSorteou = jaSorteou.map(x => x.sorteado_por.trim());

        // 3. FILTRO RIGOROSO: Só mostra no menu quem AINDA NÃO sorteou
        const disponiveisSelect = todos.filter(p => !listaQuemJaSorteou.includes(p.nome.trim()));

        selectQuemEuSou.innerHTML = '<option value="">-- Selecione seu nome --</option>';
        disponiveisSelect.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.nome.trim();
            opt.textContent = p.nome.trim();
            selectQuemEuSou.appendChild(opt);
        });

        if (disponiveisSelect.length === 0) {
            statusMsg.textContent = 'O sorteio acabou! Todos já participaram.';
        } else {
            statusMsg.textContent = '';
        }

    } catch (error) {
        console.error(error);
        alert('Erro ao carregar. Veja o console.');
    }
}

// --- LÓGICA DO SORTEIO E ANIMAÇÃO ---
async function iniciarSorteio() {
    meuNomeGlobal = selectQuemEuSou.value.trim();
    if (!meuNomeGlobal) return;

    // UI Updates
    btnSortear.disabled = true;
    showSection('roulette');
    statusMsg.textContent = "Sorteando...";
    
    try { audioSpin.play(); } catch(e) {}

    try {
        // ======================================================
        // PARTE 1: MATEMÁTICA (Segurança via Supabase)
        // ======================================================
        
        const { data: disponiveis, error } = await supabase
            .from('participantes')
            .select('nome, id')
            .is('sorteado_por', null);
        
        if (error) throw error;

        // Remove eu mesmo da lista matemática
        const candidatosReais = disponiveis.filter(p => p.nome.trim() !== meuNomeGlobal);

        // Travamento/Deadlock
        if (candidatosReais.length === 0) {
            audioSpin.pause();
            resultText.textContent = "OPS! Travou...";
            resultText.style.fontSize = "1.5rem";
            statusMsg.innerHTML = "Só sobrou você! A matemática não ajudou.<br>O sorteio precisa ser reiniciado.";
            showSection('result');
            
            btnReset.textContent = "⚠️ REINICIAR SORTEIO PARA TODOS";
            btnReset.style.background = "#ef4444";
            btnReset.style.color = "white";
            btnReset.onclick = resetarBancoDeDados;
            return;
        }

        // Escolhe o vencedor REAL
        const indiceVencedor = Math.floor(Math.random() * candidatosReais.length);
        const vencedorObj = candidatosReais[indiceVencedor];
        nomeSorteadoGlobal = vencedorObj.nome.trim();
        idSorteadoGlobal = vencedorObj.id;


        // ======================================================
        // PARTE 2: VISUAL (Animação Limpa e Rápida)
        // ======================================================
        
        let listaAnimacao = [];
        
        // 1. Filtra meu nome da lista fixa visual (pra eu não me ver girando)
        const listaLimpa = NOMES_DA_ROLETA.filter(n => n !== meuNomeGlobal);

        // 2. Efeito Carrossel: Repete a lista inteira 5 vezes
        // Isso faz girar rápido e mostra todos os nomes em sequência
        const voltas = 5; 
        for(let i=0; i < voltas; i++) {
            // Espalha a lista limpa dentro da lista de animação
            listaAnimacao.push(...listaLimpa);
        }
        
        // 3. O GRANDE FINAL: O vencedor TEM que ser o último item
        listaAnimacao.push(nomeSorteadoGlobal);

        // Renderiza a roleta no HTML
        slotStrip.innerHTML = '';
        listaAnimacao.forEach(nome => {
            const div = document.createElement('div');
            div.className = 'slot-item';
            div.textContent = nome;
            slotStrip.appendChild(div);
        });

        // ======================================================
        // PARTE 3: EXECUTA A ANIMAÇÃO
        // ======================================================
        
        const itemHeight = 120; 
        const totalHeight = (listaAnimacao.length - 1) * itemHeight; 
        
        slotStrip.style.transition = 'none';
        slotStrip.style.transform = 'translateY(0px)';
        slotStrip.offsetHeight; // force reflow

        // Gira por 4 segundos (Rápido porque a lista é longa)
        slotStrip.style.transition = 'transform 4s cubic-bezier(0.1, 0.7, 0.1, 1)'; 
        slotStrip.style.transform = `translateY(-${totalHeight}px)`;

        // Quando parar
        setTimeout(async () => {
            audioSpin.pause();
            audioSpin.currentTime = 0;
            try { audioWin.play(); } catch(e) {}

            await salvarNoBanco();
            showSection('result');
            
            resultText.textContent = nomeSorteadoGlobal;
            resultText.style.fontSize = "2.2rem";
            
            btnReset.textContent = "🔄 Voltar ao Início";
            btnReset.style.background = "rgba(255,255,255,0.1)";
            btnReset.onclick = () => window.location.reload();
            
        }, 4000);

    } catch (error) {
        console.error(error);
        alert('Erro no sorteio. Tente recarregar a página.');
        window.location.reload();
    }
}

async function salvarNoBanco() {
    try {
        const { error } = await supabase
            .from('participantes')
            .update({ sorteado_por: meuNomeGlobal })
            .eq('id', idSorteadoGlobal);
            
        if (error) throw error;
        console.log('Salvo com sucesso!');
    } catch (e) {
        console.error('Erro ao salvar, mas o usuário viu o nome.', e);
    }
}

// --- EVENTOS ---
selectQuemEuSou.addEventListener('change', (e) => {
    btnSortear.disabled = e.target.value === "";
});

btnSortear.addEventListener('click', iniciarSorteio);

btnReset.addEventListener('click', () => {
    window.location.reload();
});

// Start
window.onload = carregarNomes;