import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';

// --- CONFIGURAÇÃO ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sons (Certifique-se de ter spin.mp3 e win.mp3 na pasta, ou o navegador dará erro 404 no console, mas o site funcionará)
const audioSpin = new Audio('./sounds/spin.mp3');
const audioWin = new Audio('./sounds/win.mp3');
audioSpin.loop = true; // Loop enquanto gira

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
let nomesDisponiveis = [];
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

// --- LÓGICA DO SUPABASE ---
async function carregarNomes() {
    btnSortear.disabled = true;
    selectQuemEuSou.innerHTML = '<option value="">Carregando...</option>';
    showSection('selection');

    try {
        // 1. Pega todos os nomes
        const { data: todos, error: err1 } = await supabase.from('participantes').select('nome');
        if (err1) throw err1;

        // 2. Pega quem já sorteou
        const { data: jaSorteou, error: err2 } = await supabase.from('participantes').select('sorteado_por').not('sorteado_por', 'is', null);
        if (err2) throw err2;

        const listaQuemJaSorteou = jaSorteou.map(x => x.sorteado_por.trim());

        // 3. Filtra: só mostra no select quem AINDA NÃO sorteou
        const disponiveisSelect = todos.filter(p => !listaQuemJaSorteou.includes(p.nome.trim()));

        selectQuemEuSou.innerHTML = '<option value="">-- Selecione seu nome --</option>';
        disponiveisSelect.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.nome.trim();
            opt.textContent = p.nome.trim();
            selectQuemEuSou.appendChild(opt);
        });

        if (disponiveisSelect.length === 0) {
            alert('O sorteio acabou! Todos já participaram.');
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
    
    // Tentar tocar som (alguns navegadores bloqueiam se não houver interação prévia)
    try { audioSpin.play(); } catch(e) {}

    try {
        // 1. Busca quem pode ser sorteado (quem ainda não foi tirado)
        const { data: disponiveis, error } = await supabase
            .from('participantes')
            .select('nome, id')
            .is('sorteado_por', null);
        
        if (error) throw error;

        // 2. Filtra eu mesmo
        const candidatos = disponiveis.filter(p => p.nome.trim() !== meuNomeGlobal);

        if (candidatos.length === 0) {
            audioSpin.pause();
            alert('Erro: Só sobrou você. O sorteio travou.');
            window.location.reload();
            return;
        }

        // 3. Define o vencedor agora
        const indiceVencedor = Math.floor(Math.random() * candidatos.length);
        const vencedorObj = candidatos[indiceVencedor];
        nomeSorteadoGlobal = vencedorObj.nome.trim();
        idSorteadoGlobal = vencedorObj.id;

        // 4. Monta a fita da Slot Machine
        // Criamos uma lista longa com nomes aleatórios e colocamos o vencedor no final
        let listaAnimacao = [];
        
        // Adiciona 30 nomes aleatórios para passar rápido
        for(let i=0; i<30; i++) {
            const random = candidatos[Math.floor(Math.random() * candidatos.length)].nome;
            listaAnimacao.push(random);
        }
        // Adiciona o vencedor no final
        listaAnimacao.push(nomeSorteadoGlobal);

        // Renderiza no HTML
        slotStrip.innerHTML = '';
        listaAnimacao.forEach(nome => {
            const div = document.createElement('div');
            div.className = 'slot-item';
            div.textContent = nome;
            slotStrip.appendChild(div);
        });

        // 5. ANIMAÇÃO (CSS Transform)
        // A altura de cada item é 150px. Queremos parar no último.
        const itemHeight = 120;
        const totalHeight = (listaAnimacao.length - 1) * itemHeight; // -1 para parar no ultimo
        
        // Reseta posição
        slotStrip.style.transition = 'none';
        slotStrip.style.transform = 'translateY(0px)';

        // Força reflow
        slotStrip.offsetHeight;

        // Inicia o giro
        slotStrip.style.transition = 'transform 4s cubic-bezier(0.1, 0.7, 0.1, 1)'; // Começa rápido, para devagar
        slotStrip.style.transform = `translateY(-${totalHeight}px)`;

        // 6. QUANDO PARAR (4 segundos depois)
        setTimeout(async () => {
            audioSpin.pause();
            audioSpin.currentTime = 0;
            try { audioWin.play(); } catch(e) {}

            await salvarNoBanco();
            showSection('result');
            
            // Efeito visual no texto
            resultText.textContent = nomeSorteadoGlobal;
            
        }, 4000);

    } catch (error) {
        console.error(error);
        alert('Erro no sorteio.');
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
    // Apenas recarrega para garantir estado limpo
    window.location.reload();
});

// Start
window.onload = carregarNomes;