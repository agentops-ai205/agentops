# ADR 0001 - AgentOps OS est un Control Plane Model-Agnostic

## Statut

Accepte.

## Contexte

Le projet vise a gouverner des agents de codage auto-ameliorants sous supervision humaine. Deux options sont possibles:

- construire un agent IA autonome centre sur un fournisseur ou un modele;
- construire un control plane neutre qui controle plusieurs agents, providers et outils.

L'etat actuel du projet contient deja les bons concepts de controle: missions, policies, approvals, evidence, audit, evaluation et memoire. En revanche, les agents sont encore declaratifs et aucun moteur IA reel n'est connecte.

## Decision

AgentOps OS sera construit comme un control plane model-agnostic.

Les modeles IA, qu'ils soient open source, locaux, prives ou via API fermee, seront branches via des adapters. Ils ne seront jamais la source d'autorite du systeme.

Le coeur AgentOps reste responsable de:

- la mission;
- la policy;
- l'approval;
- les outils;
- la sandbox;
- les preuves;
- l'audit;
- l'evaluation;
- les transitions d'etat.

Le modele IA est responsable de:

- proposer un plan;
- analyser du contexte;
- proposer un patch;
- recommander des tests;
- produire une revue ou un diagnostic;
- demander des tool calls.

Le modele IA n'est pas autorise a:

- modifier directement les fichiers;
- executer librement des commandes;
- contourner les policies;
- approuver ses propres actions;
- changer son niveau d'autonomie;
- appliquer des self-improvements sans approval.

## Consequences positives

- Le produit ne depend pas d'un fournisseur IA.
- Le mode sans IA reste utile et commercialisable comme cockpit de gouvernance.
- Les clients sensibles peuvent utiliser des modeles locaux.
- Les clients qui veulent la meilleure qualite peuvent utiliser des API fermees.
- Le systeme peut comparer cout, qualite, latence et risque par provider.
- La securite repose sur AgentOps, pas sur la doc d'un modele.

## Consequences negatives

- Architecture plus complexe qu'un simple wrapper IA.
- Besoin d'un Tool Registry strict.
- Besoin d'une vraie sandbox.
- Besoin de tests de contrats.
- Plus de travail initial avant d'avoir une demo spectaculaire.

## Alternatives rejetees

### Agent autonome unique

Rejete car trop fragile pour un produit production. Un agent qui decide, execute et s'evalue lui-meme cree un faux sentiment de controle.

### Provider IA unique

Rejete car cela rend le produit dependant d'un fournisseur, de ses couts, de ses limites et de ses politiques.

### Open source only

Rejete car certains raisonnements complexes restent mieux servis par des modeles fermes selon les cas. AgentOps doit permettre ce choix sans devenir dependant.

### API fermee only

Rejete car certains clients auront besoin de confidentialite, cout controle ou execution locale.

## Regle de conception

Toute nouvelle fonctionnalite doit repondre a cette question:

> Est-ce que cela renforce le controle, la tracabilite ou la portabilite du systeme?

Si la reponse est non, la fonctionnalite doit etre repoussee ou reformulee.
