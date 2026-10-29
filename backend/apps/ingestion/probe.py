"""Descreve a ESTRUTURA de uma resposta JSON (chaves, tipos, tamanhos) sem mostrar nenhum valor.

Serve para a sondagem da API do Data Suite: o resultado pode ser colado em chat ou ticket sem expor telefone,
nome de motorista, e-mail ou token."""

MAX_DEPTH = 4


def _type_name(value) -> str:
    if value is None:
        return "nulo"
    if isinstance(value, bool):
        return "booleano"
    if isinstance(value, int):
        return "inteiro"
    if isinstance(value, float):
        return "decimal"
    if isinstance(value, str):
        return "texto"
    if isinstance(value, list):
        return f"lista de {len(value)}"
    if isinstance(value, dict):
        return f"objeto com {len(value)} chaves"
    return type(value).__name__


def describe(value, name: str = "resposta", depth: int = 0, lines=None) -> list:
    lines = [] if lines is None else lines
    pad = "  " * depth
    lines.append(f"{pad}{name}: {_type_name(value)}")
    if depth >= MAX_DEPTH:
        return lines
    if isinstance(value, dict):
        for key, child in value.items():
            describe(child, str(key), depth + 1, lines)
    elif isinstance(value, list) and value:
        describe(value[0], "(1º elemento)", depth + 1, lines)
    return lines
