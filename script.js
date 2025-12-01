import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';

// --- CONFIGURAÇÃO ---
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
let todosOsNomesVisual = []; // LISTA COMPLETA (Só para a animação ficar bonita)
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
        // 1. Pega TODOS os nomes do banco
        const { data: todos, error: err1 } = await supabase.from('participantes').select('nome');
        if (err1) throw err1;

        // --- SALVA PARA A ANIMAÇÃO ---
        // Aqui guardamos todo mundo, inclusive quem já saiu, para a roleta ficar cheia
        todosOsNomesVisual = todos.map(p => p.nome.trim());

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
        // PARTE 1: MATEMÁTICA (Segurança)
        // ======================================================
        
        // Busca APENAS quem ainda não foi sorteado (sorteado_por = NULL)
        const { data: disponiveis, error } = await supabase
            .from('participantes')
            .select('nome, id')
            .is('sorteado_por', null);
        
        if (error) throw error;

        // Remove eu mesmo da lista matemática (não posso me tirar)
        const candidatosReais = disponiveis.filter(p => p.nome.trim() !== meuNomeGlobal);

        // Se não sobrou ninguém (Travamento/Deadlock)
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

        // Escolhe o vencedor REAL aqui
        const indiceVencedor = Math.floor(Math.random() * candidatosReais.length);
        const vencedorObj = candidatosReais[indiceVencedor];
        nomeSorteadoGlobal = vencedorObj.nome.trim();
        idSorteadoGlobal = vencedorObj.id;


        // ======================================================
        // PARTE 2: VISUAL (Animação da Roleta)
        // ======================================================
        
        let listaAnimacao = [];
        
        // Aqui usamos a lista 'todosOsNomesVisual' que contém TODO MUNDO.
        // Isso garante que a roleta mostre vários nomes, criando suspense.
        
        // Filtramos apenas o meu próprio nome (pra não aparecer eu mesmo girando)
        const nomesParaGirar = todosOsNomesVisual.filter(n => n !== meuNomeGlobal);

        // Gera 40 itens aleatórios para a fita
        for(let i=0; i<40; i++) {
            const nomeAleatorio = nomesParaGirar[Math.floor(Math.random() * nomesParaGirar.length)];
            listaAnimacao.push(nomeAleatorio);
        }
        
        // OBRIGATÓRIO: O último nome TEM que ser o vencedor real
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
        
        const itemHeight = 120; // Altura definida no CSS
        const totalHeight = (listaAnimacao.length - 1) * itemHeight; 
        
        // Reseta posição
        slotStrip.style.transition = 'none';
        slotStrip.style.transform = 'translateY(0px)';
        slotStrip.offsetHeight; // force reflow

        // Gira por 5 segundos
        slotStrip.style.transition = 'transform 5s cubic-bezier(0.1, 0.7, 0.1, 1)'; 
        slotStrip.style.transform = `translateY(-${totalHeight}px)`;

        // Quando parar (5s depois)
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
            
        }, 5000);

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