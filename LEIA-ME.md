# Controle de Gastos — site do casal

Site para vocês dois lançarem gastos e receitas pelo celular ou pelo computador e acompanharem tudo num painel.
**Tudo fica no próprio site**, num banco de dados só de vocês (Firebase, do Google, plano gratuito). A planilha do Drive não é usada.

- **Tempo real:** o que um lança aparece na hora na tela do outro.
- **Funciona sem internet:** se lançar sem sinal, fica guardado no celular e sobe sozinho quando a conexão voltar.
- **Só vocês dois entram:** login com a conta Google, e o banco só aceita os e-mails que vocês liberarem.

| Página | Para que serve |
| --- | --- |
| Painel | Receitas, gastos, guardado e saldo do mês; gráfico dos últimos 6 meses; orçamento por categoria; parcelas dos próximos meses; metas |
| Lançamentos | Lista com busca e filtros; lançar, editar e apagar gastos (a subcategoria depende da categoria) |
| Receitas | Receitas do mês por pessoa |
| Contas fixas | Cadastro das contas do mês e botão para lançar as que faltam |
| Metas e orçamento | Metas (Europa, reserva, lava e seca), aportes e tetos de cada categoria |
| Assistente | Análise do mês refeita a cada dado novo e perguntas |
| Configurações | Importar, baixar backup, editar categorias, ligar a IA |

Cada vez que vocês lançam algo, o assistente mostra na hora o que mudou: se a categoria passou do teto, se a parcela estoura o teto de parcelas, se pode ser duplicado e como ficou o saldo do mês.

---

## Passo 1 — Banco de dados (já feito)

O projeto Firebase **controle-de-gastos-88747** (conta carlosh2000carlos@gmail.com) já está pronto:
Firestore criado, regras publicadas, login com Google ativado e `assets/js/firebase-config.js` preenchido.

Para liberar mais alguém (ou trocar o e-mail da Beatriz): **Firestore → Regras**, acrescente o e-mail em letras minúsculas na lista e clique em **Publicar**. O arquivo `firestore.rules` desta pasta é a cópia de referência.

> Os valores de `firebase-config.js` não são senha: o Firebase foi feito para eles ficarem visíveis no site. Quem protege os dados são as regras.

## Passo 2 — Publicar no GitHub Pages

O código já está no repositório **https://github.com/taktarov/controle-de-gastos** e o domínio `taktarov.github.io` já está liberado no Firebase.

1. No GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save**.
2. Em um ou dois minutos o site fica em **https://taktarov.github.io/controle-de-gastos/**.

Para mandar uma alteração depois: no GitHub, abra o arquivo → ícone de lápis → edite → **Commit changes**. O site atualiza sozinho em um minuto.
Nunca envie `dados-iniciais-PRIVADO.json` nem arquivos de backup para o GitHub: o repositório é público.

## Passo 3 — Primeiro acesso e importação dos dados

1. Abra o site e clique em **Entrar com Google**. Escolha "Carlos" em "Quem é você?".
2. Como o banco está vazio, aparece **Banco de dados novo**. Escolha o arquivo **`dados-iniciais-PRIVADO.json`** desta pasta e clique em **Importar**.
   Ele traz da planilha: 341 lançamentos, 42 receitas, 10 contas fixas, as categorias, os tetos do orçamento e as metas.
   O salário de agosto que estava lançado duas vezes na planilha ficou de fora.
3. Pronto. A importação é uma vez só. Depois, guarde esse arquivo num lugar seguro ou apague.
4. A Beatriz abre o mesmo endereço no celular dela, entra com a conta Google dela e escolhe "Beatriz".
5. No celular, use o menu do navegador → **Adicionar à tela inicial** para abrir como um aplicativo.

Para só ver como funciona, sem mexer no banco, use **Ver demonstração**: os dados são inventados e ficam só naquele navegador.

## Todo mês: faturas dos cartões

1. Coloquem as faturas fechadas do mês na pasta do Drive **Faturas/<Mês>** (por exemplo `Faturas/Dezembro`): C6 e Itaú do Carlos e as faturas dos cartões da Beatriz. O relatório de despesas da empresa continua na pasta **Relatórios empresa**.
2. Entre os dias 5 e 8, o Claude lê tudo sozinho, separa o que é da empresa (reembolsado), calcula bônus VR e pocket money e cria na mesma pasta o arquivo **`importar-no-site-AAAA-MM.json`**. Você recebe um resumo com o que precisa conferir.
3. No site: **Configurações → Importar** → escolha esse arquivo (no celular, dá para escolher direto do Google Drive).

O que vocês já tiverem lançado à mão com o mesmo valor (até 1 dia de diferença na data) não entra repetido.
Não lancem mais à mão o valor total da fatura da Beatriz: agora as compras dela entram uma por uma.
As contas fixas (condomínio, Caixa, luz…) continuam pelo botão **Lançar contas do mês**.

## Dia a dia

- **Lançar:** botão **+** (celular) ou **+ Lançar** (computador). Gasto ou receita.
- **Contas fixas:** no começo do mês, Contas fixas → **Lançar contas do mês**. As de valor variável entram como "⚠ CONFERIR VALOR"; quando a conta chegar, clique em Conferir, ajuste o valor e marque Pago.
- **Guardar dinheiro:** Metas e orçamento → **Registrar aporte**. Aparece como "Guardado" no painel.
- **Backup:** Configurações → **Baixar backup (.json)** uma vez por mês. Para restaurar, use Importar com esse arquivo.
- **Categorias:** Configurações → Categorias. Uma por linha, no formato `Categoria: sub1, sub2, sub3`.

## Opcional — Ligar a IA (Claude) no Assistente

Sem isso, o Assistente já faz a análise completa e responde sobre gastos, saldo, categorias, parcelas e metas.
Com a IA, vocês fazem qualquer pergunta ("dá para comprar a lava e seca este mês?", "onde cortar R$ 500?").

1. Crie uma chave em **https://console.anthropic.com** (é paga por uso; uma pergunta custa centavos).
2. No site: **Configurações → Chave da API Claude** → cole a chave → Salvar.

A chave fica guardada **só naquele aparelho** (cada um coloca no seu). Não coloque em computador compartilhado.
Para a IA vai só um resumo dos números (totais por mês e por categoria, metas e os maiores gastos do mês).

## Perguntas comuns

**"O e-mail … não tem acesso a este banco."** Esse e-mail não está nas regras do passo 3. Acrescente-o (em minúsculas) nas regras do Firestore e publique de novo (passo 1).

**O login não abre no site publicado.** Falta o domínio do site em Firebase → Authentication → Configurações → Domínios autorizados.

**Aparece "Falta ligar o banco de dados".** O `firebase-config.js` publicado está sem os dados do projeto. Confira se ele está igual ao desta pasta.

**Lancei sem internet.** O canto do menu mostra "Offline · guardado no aparelho". Quando a internet voltar, sobe sozinho. Só não limpe os dados do navegador antes disso.

**Apaguei sem querer.** Lance de novo, ou restaure de um backup (Importar o arquivo de backup só traz o que está faltando, não duplica).

**Quanto custa?** Nada, no uso de vocês. O plano gratuito do Firebase aguenta dezenas de milhares de leituras e gravações por dia.

## Arquivos

```
index.html                    página do site
firestore.rules               regras de acesso do banco (colar no Firebase)
assets/js/firebase-config.js  dados do projeto Firebase (já preenchido)
assets/js/app.js              telas e formulários
assets/js/api.js              banco de dados (Firebase) e modo demonstração
assets/js/calc.js             cálculos (parcela cai em cada mês, como na planilha)
assets/js/assistente.js       análise automática
assets/js/graficos.js         gráficos
assets/js/demo.js             dados inventados da demonstração
assets/css/app.css            visual
dados-iniciais-PRIVADO.json   seus dados da planilha, para importar uma vez (não vai para o GitHub)
```
