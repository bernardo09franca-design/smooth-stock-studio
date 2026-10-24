# Smooth Stock Studio

PROMPT COMPLETO PARA O LOVABLE — SISTEMA DE CONTROLE DE PRODUTOS PARA ESTÚDIO DE DEPILAÇÃO E TRATAMENTOS



1. Objetivo do projeto



Desenvolva a primeira versão funcional de um sistema web de gestão de produtos e consumo para um único estúdio especializado em depilação e tratamentos estéticos.



O sistema deve ajudar a proprietária a entender:



- Quais produtos são mais utilizados.

- Quais produtos são mais comprados.

- Quanto custa cada produto e como seu preço varia ao longo dos meses.

- Quanto de cada produto existe em estoque.

- Quais produtos estão acabando e precisam ser comprados.

- Quanto de produto cada procedimento consome.

- Qual é o custo estimado dos produtos utilizados em cada procedimento.



A aplicação deve ser simples de utilizar, visualmente profissional, rápida e organizada. A prioridade é automatizar cálculos e tarefas repetitivas, reduzindo a necessidade de controles manuais em cadernos e planilhas.



Esta é somente a primeira versão do produto. Não desenvolver funcionalidades desnecessárias nem transformar o projeto em um ERP completo.



2. Restrições técnicas obrigatórias



Nesta primeira versão, utilizar exclusivamente o armazenamento local do navegador.



Tecnologias e arquitetura



- Utilizar React e TypeScript, caso sejam compatíveis com a estrutura inicial do projeto.

- Utilizar uma biblioteca de componentes e ícones consistente.

- Utilizar gráficos interativos para a análise de preços e consumo.

- Utilizar "localStorage" para persistir os dados.

- Separar a interface, as regras de negócio, os cálculos e a persistência em módulos organizados.

- Criar uma camada centralizada de leitura e gravação dos dados.

- Implementar validações e tratamento de erros.

- Utilizar identificadores únicos para os registros.

- Manter os dados disponíveis após atualizar ou fechar e reabrir a página no mesmo navegador e perfil.



Não implementar nesta versão



- Banco de dados externo.

- Supabase, Firebase ou serviços equivalentes.

- Backend, APIs próprias ou servidores para persistência.

- Login, autenticação ou gestão de usuários.

- Integrações com fornecedores, marketplaces ou outros sistemas.

- Pagamentos, assinaturas ou módulos financeiros.

- Controle de funcionários, comissões ou folha de pagamento.

- Fluxo de caixa ou contas a pagar e receber.

- Inteligência artificial externa.

- Envio automático de mensagens, e-mails ou notificações externas.



Não adicionar serviços externos apenas por conveniência.



O projeto deve funcionar como uma aplicação local, sem depender de uma conexão com a internet para consultar ou modificar os dados já salvos, exceto pelos recursos externos de interface que eventualmente forem utilizados.



3. Direção visual e experiência do usuário



Criar uma interface moderna, elegante e profissional, apropriada para um negócio de estética.



Estilo visual



- Design limpo, sofisticado e minimalista.

- Fundo predominantemente claro.

- Tons neutros e suaves, com uma cor de destaque elegante.

- Cards com bordas discretas, cantos arredondados e sombras sutis.

- Tipografia legível e hierarquia visual clara.

- Ícones simples e consistentes.

- Gráficos com boa legibilidade.

- Espaçamento confortável entre elementos.

- Botões e formulários com estados de foco, carregamento, sucesso e erro quando aplicável.



Evitar excesso de cores, gradientes exagerados, elementos decorativos desnecessários e aparência de painel administrativo genérico.



A interface deve transmitir organização, controle e confiança.



Layout



Em computadores, utilizar uma estrutura com menu lateral fixo ou recolhível, cabeçalho e área principal de conteúdo.



O menu lateral deve conter:



1. Visão geral.

2. Produtos e estoque.

3. Compras.

4. Análise de preços.

5. Procedimentos e consumo.

6. Configurações e backup.



Em dispositivos móveis, adaptar a navegação para uma experiência confortável, com menus compactos, formulários responsivos e tabelas que possam ser consultadas sem prejudicar a usabilidade.



Não criar telas separadas desnecessárias. Priorizar fluxos curtos e intuitivos.



4. Módulo: Visão geral



Criar um dashboard inicial que apresente um resumo operacional do estúdio.



Indicadores principais



Exibir cards com:



- Total de produtos cadastrados.

- Quantidade de produtos com estoque baixo.

- Quantidade de produtos sem estoque.

- Total de unidades ou embalagens em estoque, quando essa soma fizer sentido.

- Valor estimado do estoque, calculado com base no custo unitário definido pela regra de avaliação adotada.

- Quantidade de compras registradas no mês.

- Custo total das compras realizadas no mês.

- Produtos com maiores consumos registrados no período.



Os indicadores devem ser calculados automaticamente a partir dos dados armazenados. Não inserir números fixos para simular resultados.



Gráficos e informações



Incluir:



- Gráfico dos produtos mais consumidos.

- Gráfico dos produtos com maior volume de compras.

- Resumo de produtos com estoque baixo.

- Lista de movimentações recentes.

- Atalhos para cadastrar produto, registrar compra e consultar preços.



Permitir a seleção de períodos quando pertinente, como mês atual, últimos três meses, últimos seis meses e últimos doze meses.



Se ainda não houver dados, exibir um estado vazio com uma explicação objetiva e um botão para iniciar o cadastro. Não exibir gráficos fictícios como se fossem dados reais.



5. Módulo: Produtos e estoque



Este módulo será a base do sistema. Deve suportar mais de 150 produtos sem comprometer a usabilidade.



Cadastro de produtos



Cada produto deve permitir registrar:



- Nome do produto.

- Categoria.

- Marca.

- Descrição opcional.

- Unidade de controle.

- Conteúdo da embalagem.

- Unidade de medida do conteúdo.

- Quantidade atual em estoque.

- Estoque mínimo.

- Fornecedor habitual, opcional.

- Observações.

- Status ativo ou inativo.

- Data de cadastro.

- Data da última atualização.



Exemplos de unidades e conteúdos:



- 1 frasco de 500 ml.

- 1 embalagem de 1 litro.

- 1 pacote de 100 unidades.

- 1 pote de 250 g.

- 1 caixa com 50 unidades.



Permitir trabalhar com unidades compatíveis, como ml, litros, g, kg e unidades.



Quando possível, converter automaticamente unidades compatíveis para cálculos de consumo. Por exemplo, 1 litro deve equivaler a 1.000 ml.



Não misturar unidades incompatíveis. Gramas e mililitros, por exemplo, não devem ser convertidos automaticamente sem uma informação de densidade apropriada.



Listagem



Exibir uma tabela ou lista com:



- Nome.

- Categoria.

- Marca.

- Estoque atual.

- Unidade.

- Custo unitário de referência.

- Situação do estoque.

- Ações disponíveis.



Incluir:



- Busca por nome ou marca.

- Filtro por categoria.

- Filtro por situação do estoque.

- Ordenação por nome, estoque e custo.

- Paginação ou outra solução adequada para listas grandes.

- Ações para visualizar, editar e inativar produtos.

- Botão para cadastrar novo produto.



Evitar exclusão definitiva de produtos que tenham histórico de compras, consumo ou movimentações. Preferir inativação, preservando os registros anteriores.



Regras de estoque



O estoque deve ser atualizado automaticamente por meio das movimentações registradas.



- Compras recebidas aumentam o estoque.

- Consumo de procedimentos diminui o estoque.

- Ajustes manuais devem gerar uma movimentação identificável.

- Não permitir quantidades negativas sem uma decisão explícita e justificada do usuário.

- Exibir alertas quando o estoque atingir ou ficar abaixo do mínimo.

- Não gerar movimentações duplicadas quando uma tela for atualizada ou um formulário for enviado novamente.



Separar claramente a quantidade em embalagens da quantidade em unidades de consumo quando necessário.



Exemplo: uma compra de 3 frascos de 500 ml deve representar 3 frascos em estoque e 1.500 ml de conteúdo total disponível para consumo.



6. Módulo: Compras



Este módulo deverá substituir gradualmente as anotações manuais e planilhas utilizadas atualmente.



Registrar uma compra



Criar um formulário para registrar uma compra com:



- Data da compra.

- Fornecedor, opcional.

- Número ou identificação do comprovante, opcional.

- Observações.

- Um ou mais itens comprados.



Cada item deverá conter:



- Produto.

- Quantidade de embalagens compradas.

- Conteúdo por embalagem, quando aplicável.

- Valor total pago pelo item.

- Desconto, quando aplicável.

- Custo unitário calculado automaticamente.

- Quantidade total adquirida na unidade de consumo.



O sistema deverá calcular automaticamente:



- Total da compra.

- Custo por embalagem.

- Custo por unidade de consumo.

- Quantidade total adquirida.

- Variação de preço em relação à última compra comparável.



Para calcular o custo unitário, utilizar o valor efetivamente pago pelo item, considerando descontos informados e sem contar o valor total da compra mais de uma vez.



Se houver frete ou outros custos de aquisição, permitir registrá-los como opcionais e, se forem atribuídos aos itens, distribuir esses custos de maneira consistente. Caso não haja essa informação, não inventar valores.



Exemplo de cálculo



Uma compra contém:



- Produto: loção.

- Quantidade: 2 frascos.

- Conteúdo: 500 ml por frasco.

- Valor total pago pelos dois frascos: R$ 40,00.



O sistema deverá calcular:



- Custo por frasco: R$ 20,00.

- Quantidade total adquirida: 1.000 ml.

- Custo por ml: R$ 0,04.



Esses cálculos devem ser automáticos.



Salvamento da compra



Ao confirmar uma compra:



1. Validar os dados.

2. Salvar o registro da compra.

3. Salvar os respectivos itens.

4. Registrar as movimentações de entrada no estoque.

5. Atualizar os dados utilizados pelos indicadores e gráficos.

6. Registrar o preço praticado na data da compra para o histórico do produto.



Toda a operação deverá ser consistente. Não deixar uma compra parcialmente registrada se uma das etapas falhar.



O sistema deve permitir consultar compras anteriores e visualizar seus itens.



Se uma compra for corrigida ou cancelada, atualizar o estoque por meio de movimentos de correção, preservando o histórico e evitando a aplicação duplicada de entradas ou saídas.



7. Módulo: Análise de preços



Este será um dos principais diferenciais da aplicação.



O sistema deverá mostrar a evolução do preço de cada produto ao longo dos meses.



Gráfico de histórico de preços



Criar uma tela que permita:



1. Selecionar um produto.

2. Definir um período.

3. Visualizar a evolução dos preços.

4. Consultar os registros que deram origem ao gráfico.



O gráfico deve mostrar o custo unitário comparável ao longo do tempo.



Exemplo:



Mês| Produto| Custo por frasco

Janeiro| Loção| R$ 18,00

Fevereiro| Loção| R$ 19,50

Março| Loção| R$ 21,00

Abril| Loção| R$ 20,00



Esses valores são apenas ilustrativos para explicar o funcionamento e não devem ser inseridos como dados reais.



Regras obrigatórias do histórico



- Registrar o preço associado à data real de cada compra.

- Comparar embalagens equivalentes ou converter os valores para uma unidade de consumo comum.

- Não comparar diretamente embalagens de tamanhos diferentes sem normalizar os custos.

- Não inventar preços para meses sem compras.

- Não interpretar um mês sem compra como preço zero.

- Mostrar claramente a data da última compra.

- Exibir o menor preço, o maior preço e o preço mais recente no período, quando existirem dados suficientes.

- Calcular a variação percentual entre compras comparáveis.

- Mostrar os dados de origem quando o usuário selecionar um ponto do gráfico.



Se não houver uma compra em determinado mês, o gráfico deverá representar a ausência de uma nova observação, sem criar um preço fictício.



Quando houver mais de uma compra do mesmo produto no mês, exibir as observações individuais ou utilizar uma consolidação mensal claramente identificada, sem ocultar o histórico original.



Indicadores complementares



Para cada produto, mostrar:



- Último custo unitário registrado.

- Custo unitário anterior.

- Variação percentual.

- Menor custo no período.

- Maior custo no período.

- Data da última compra.

- Quantidade comprada no período.



Distinguir o preço de uma embalagem do custo por unidade de consumo, para que os indicadores não sejam confundidos.



8. Módulo: Procedimentos e consumo



Este módulo deverá relacionar os produtos cadastrados aos procedimentos realizados no estúdio.



A estrutura deve permitir registrar os insumos utilizados em cada tipo de procedimento.



Cadastro de procedimentos



Cada procedimento deve permitir:



- Nome.

- Descrição opcional.

- Duração estimada, opcional.

- Status ativo ou inativo.

- Lista de produtos utilizados.

- Quantidade estimada de cada produto por atendimento.



Exemplos de procedimentos: depilação de determinada região, tratamento estético especializado ou protocolo específico do estúdio.



Não presumir quais produtos são utilizados em cada procedimento. A proprietária deverá definir essas informações.



Ficha de consumo



Para cada procedimento, permitir criar uma receita de consumo, também chamada de ficha técnica.



Exemplo ilustrativo:



- Procedimento: tratamento A.

- Produto 1: 20 ml.

- Produto 2: 5 g.

- Produto 3: 1 unidade.



O sistema deverá calcular o custo estimado dos produtos utilizados com base nos custos unitários disponíveis.



Se o custo de algum produto não estiver disponível, informar que o cálculo está incompleto em vez de assumir custo zero.



Registro de atendimentos



Criar um fluxo simples para registrar a realização de um procedimento e o consumo correspondente.



O registro deverá conter:



- Data.

- Procedimento.

- Quantidade de atendimentos, quando aplicável.

- Produtos e quantidades consumidas.

- Custo estimado dos produtos consumidos.

- Observações opcionais.



Ao confirmar o atendimento, baixar os produtos correspondentes do estoque automaticamente.



Permitir ajustar o consumo real antes da confirmação, pois a quantidade efetivamente utilizada pode variar.



Cada atendimento deve gerar um registro próprio de consumo, para impedir que a atualização da tela ou o reenvio do formulário provoque uma segunda baixa de estoque.



Se o usuário editar ou cancelar um atendimento já confirmado, realizar movimentos compensatórios e preservar o histórico.



Relatórios de consumo



Permitir visualizar:



- Produtos mais consumidos.

- Quantidade consumida por produto.

- Consumo por procedimento.

- Custo estimado dos insumos por procedimento.

- Consumo total por período.

- Comparação entre consumo estimado e consumo real, quando houver registros suficientes.



Não criar agenda, prontuário de clientes ou sistema de agendamento nesta primeira versão.



9. Módulo: Configurações e backup



Como os dados ficarão no navegador, a proteção contra perda de informações é obrigatória.



Backup



Criar uma seção de backup com:



- Botão para exportar todos os dados em JSON.

- Botão para importar um backup JSON válido.

- Validação da estrutura e versão do arquivo.

- Mensagem de confirmação antes de substituir os dados existentes.

- Mensagem clara em caso de erro.

- Data do último backup manual, quando disponível.



O backup deve incluir produtos, compras, itens comprados, movimentações, histórico de preços, procedimentos, fichas de consumo, atendimentos, configurações e demais registros necessários para reconstruir os dados.



A importação deve validar o arquivo antes de alterar os dados atuais. Não sobrescrever os registros existentes silenciosamente.



Se for possível, permitir exportar relatórios em CSV para consulta em planilhas. Isso deve ser feito localmente, sem integração externa.



Configurações



Permitir configurar:



- Nome do estabelecimento.

- Moeda utilizada, inicialmente real brasileiro (BRL).

- Preferências de exibição.

- Categorias de produtos.

- Unidades de medida disponíveis.



Utilizar formatação monetária brasileira, como R$ 19,90, e datas no padrão brasileiro.



10. Modelo de dados local



Organizar os dados com estruturas consistentes e versionadas.



Criar, no mínimo, as seguintes entidades lógicas:



Product



- id

- name

- category

- brand

- description

- packagingQuantity

- packagingUnit

- contentQuantity

- contentUnit

- minimumStock

- defaultSupplier

- active

- createdAt

- updatedAt



Purchase



- id

- purchaseDate

- supplier

- reference

- notes

- totalAmount

- status

- createdAt

- updatedAt



PurchaseItem



- id

- purchaseId

- productId

- packageQuantity

- contentQuantity

- contentUnit

- totalPaid

- discount

- unitCost

- normalizedUnitCost

- createdAt



StockMovement



- id

- productId

- movementType

- quantity

- unit

- movementDate

- sourceType

- sourceId

- notes

- createdAt



Tipos de movimentação possíveis: entrada por compra, saída por consumo, ajuste positivo, ajuste negativo e reversão.



Procedure



- id

- name

- description

- estimatedDuration

- active

- createdAt

- updatedAt



ProcedureRecipeItem



- id

- procedureId

- productId

- quantity

- unit



ServiceSession



- id

- procedureId

- sessionDate

- quantity

- status

- notes

- createdAt



ServiceConsumptionItem



- id

- sessionId

- productId

- quantity

- unit

- unitCostAtConsumption

- totalCost



Settings



- businessName

- currency

- schemaVersion

- outras preferências necessárias



Os nomes acima são uma referência de organização, não uma obrigação de criar uma tabela real de banco de dados.



Utilizar estruturas adequadas para o armazenamento local. É permitido incluir campos adicionais quando necessários para integridade, auditoria, reversões e compatibilidade de versões.



O histórico de preços pode ser derivado dos registros de compras. Não duplicar desnecessariamente o mesmo dado em diversas estruturas. Se houver uma estrutura auxiliar para otimizar consultas, manter uma única fonte confiável e garantir sua consistência.



11. Organização do código



Estruturar o projeto de forma modular.



Sugestão de organização:



- "components/": componentes reutilizáveis.

- "pages/": telas principais.

- "features/products/": cadastro e consulta de produtos.

- "features/purchases/": compras e itens comprados.

- "features/stock/": movimentações e cálculos de estoque.

- "features/price-analysis/": histórico e gráficos de preços.

- "features/procedures/": procedimentos e fichas de consumo.

- "features/dashboard/": indicadores e resumos.

- "features/backup/": exportação e importação.

- "lib/storage/": camada de persistência local.

- "lib/calculations/": regras e cálculos.

- "lib/validation/": validações.

- "types/": tipos TypeScript.



Adapte essa organização à estrutura existente do projeto. Não duplicar arquivos ou bibliotecas sem necessidade.



A camada de armazenamento deve centralizar o acesso ao "localStorage". As telas não devem acessar diretamente chaves diferentes de armazenamento de maneira desorganizada.



Separar cálculos da interface para facilitar testes e futuras alterações.



12. Regras de integridade e cálculos



Estas regras são obrigatórias:



1. Utilizar identificadores únicos e referências consistentes entre registros.

2. Validar campos obrigatórios antes de salvar.

3. Não aceitar valores negativos em quantidades de compra ou consumo sem uma regra explícita.

4. Não aceitar valores monetários inválidos.

5. Evitar duplicidade de registros quando o usuário clicar várias vezes no mesmo botão.

6. Armazenar datas em formato consistente e exibi-las no padrão brasileiro.

7. Utilizar arredondamento monetário consistente e evitar erros de ponto flutuante nos cálculos financeiros.

8. Preservar os valores históricos de compras, mesmo que o nome ou as informações do produto sejam alterados posteriormente.

9. Não permitir que alterações no cadastro atual modifiquem retroativamente o custo histórico de um atendimento.

10. Registrar a origem das movimentações de estoque.

11. Recalcular indicadores a partir dos dados confiáveis.

12. Tratar registros ausentes, corrompidos ou incompatíveis com uma versão anterior do armazenamento.

13. Não apagar todo o armazenamento automaticamente quando ocorrer um erro.

14. Exibir mensagens claras para o usuário quando uma operação não puder ser concluída.



Regras de custo



Distinguir claramente:



- Custo da embalagem comprada.

- Custo por unidade de consumo.

- Custo de referência do estoque.

- Custo histórico registrado na compra.

- Custo estimado de consumo.



Não misturar esses conceitos.



Para o valor estimado do estoque, adotar um método de custo documentado e consistente, como custo médio ponderado, calculado a partir das entradas de estoque. O método deve tratar corretamente compras em unidades equivalentes e ajustes.



O custo histórico de cada compra não deve ser alterado quando o preço de uma compra posterior mudar.



O custo de consumo deve registrar o valor utilizado no momento do atendimento, evitando que mudanças futuras no preço alterem os relatórios históricos.



13. Automação e usabilidade



Automatizar os cálculos e tarefas que não exigem decisões da proprietária.



Exemplos:



- Cálculo do custo unitário após informar o valor pago e a quantidade.

- Conversão de unidades compatíveis.

- Atualização de estoque após compras e consumo.

- Geração de alertas de estoque baixo.

- Cálculo da variação entre preços.

- Atualização de gráficos e indicadores após cada operação.

- Cálculo do custo estimado dos produtos por procedimento.

- Identificação dos produtos mais consumidos.

- Identificação de produtos sem compras recentes, quando houver dados suficientes para essa análise.



Evitar exigir que a usuária informe manualmente o mesmo dado em vários lugares.



Utilizar formulários com rótulos claros, máscaras quando apropriadas, mensagens de validação e valores calculados em tempo real.



Solicitar confirmação para ações destrutivas ou que possam alterar o histórico.



14. Dados iniciais e primeiro acesso



Não cadastrar dados fictícios automaticamente.



Na primeira abertura, exibir uma tela de boas-vindas explicando que a usuária pode começar cadastrando seus produtos.



Disponibilizar atalhos para:



- Cadastrar o primeiro produto.

- Registrar a primeira compra.

- Importar dados por backup.

- Consultar uma breve orientação de uso.



Caso sejam criados exemplos demonstrativos para testes, mantê-los separados dos dados reais e nunca inseri-los silenciosamente no ambiente de uso.



Preparar a interface para suportar mais de 150 produtos desde o início, com pesquisa eficiente, filtros e formulários adequados.



15. Testes e critérios de aceitação



Antes de considerar a primeira versão concluída, verificar os seguintes cenários:



Produtos



- É possível cadastrar, editar, pesquisar e inativar produtos.

- A lista suporta mais de 150 produtos.

- Os filtros e a ordenação funcionam.

- O estoque mínimo gera o alerta correto.



Compras



- É possível registrar uma compra com vários produtos.

- Os cálculos de custo unitário estão corretos.

- O estoque aumenta de acordo com as quantidades recebidas.

- O histórico de preços registra os valores e as datas corretas.

- Corrigir ou cancelar uma compra não duplica movimentações.



Preços



- O gráfico mostra o histórico real de compras.

- O custo por unidade de consumo é comparável entre embalagens diferentes.

- Meses sem compra não são representados como preço zero.

- A variação percentual é calculada corretamente.

- Os detalhes do gráfico correspondem aos registros de origem.



Procedimentos



- É possível cadastrar procedimentos e suas fichas de consumo.

- O custo estimado é calculado corretamente.

- O registro de atendimento reduz o estoque.

- Editar ou cancelar um atendimento confirmado não provoca baixa duplicada.

- O histórico preserva o custo registrado no momento do atendimento.



Persistência e backup



- Os dados continuam disponíveis após atualizar a página.

- Os dados continuam disponíveis ao reabrir o aplicativo no mesmo navegador e perfil.

- A exportação JSON inclui os registros necessários.

- Um backup válido pode ser restaurado.

- Um arquivo inválido não destrói os dados existentes.

- A aplicação apresenta mensagens adequadas para falhas de armazenamento.



Interface



- A aplicação funciona em computadores e celulares.

- Não existem botões sem ação.

- Não existem telas principais apenas ilustrativas.

- Não existem indicadores fixos fingindo representar dados reais.

- Os estados vazios e os erros são tratados.

- O console não apresenta erros que comprometam o funcionamento.



Criar testes automatizados para as regras críticas de cálculo, estoque, histórico de preços e reversão de movimentações sempre que viável.



16. Ordem de implementação



Construir o projeto nesta sequência:



Etapa 1 — Estrutura e persistência



- Layout principal.

- Navegação.

- Tipos e modelos de dados.

- Camada de "localStorage".

- Validações.

- Configurações iniciais.



Etapa 2 — Produtos e estoque



- Cadastro e edição de produtos.

- Listagem, pesquisa e filtros.

- Estoque mínimo.

- Movimentações.



Etapa 3 — Compras e preços



- Registro de compras.

- Cálculos de custo.

- Atualização de estoque.

- Histórico de preços.

- Gráficos mensais.



Etapa 4 — Procedimentos e consumo



- Cadastro de procedimentos.

- Fichas de consumo.

- Registro de atendimentos.

- Baixa de estoque.

- Cálculo do custo estimado por procedimento.



Etapa 5 — Dashboard e backup



- Indicadores calculados.

- Gráficos de consumo.

- Alertas.

- Exportação e importação.

- Revisão responsiva e testes.



A implementação pode ser dividida em etapas, mas as funcionalidades entregues em cada etapa devem funcionar de verdade.



17. Preparação para evolução futura



Embora esta versão utilize exclusivamente "localStorage", não acoplar todas as regras de negócio diretamente à interface.



Criar uma camada de persistência substituível, para que futuramente seja possível migrar para um banco de dados sem precisar reconstruir todas as telas e os cálculos.



Não implementar essa migração agora.



Limitação importante: os dados do "localStorage" ficam vinculados ao navegador e ao perfil utilizados. Eles não são sincronizados entre dispositivos e podem ser perdidos se os dados locais forem apagados. O sistema deve comunicar essa limitação de forma simples e incentivar backups periódicos.



18. Instrução final ao Lovable



Implemente a aplicação como um sistema real, não como um protótipo visual.



Priorize correção dos cálculos, integridade do estoque, preservação do histórico e simplicidade operacional.



Não adicionar funcionalidades fora do escopo. Não implementar banco de dados, autenticação ou integrações externas. Não substituir o armazenamento local por serviços externos.



Antes de finalizar, revise os fluxos completos, teste os cálculos com valores conhecidos e corrija os problemas encontrados.



O resultado esperado é uma primeira versão funcional, responsiva, organizada e preparada para a gestão diária de produtos, compras, preços e consumo de um único estúdio de depilação e tratamentos especializados.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b970a93f-345c-4586-a37f-93ebd20df154).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
