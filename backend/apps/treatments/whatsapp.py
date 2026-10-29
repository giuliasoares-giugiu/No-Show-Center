from urllib.parse import quote


class _SafeDict(dict):
    def __missing__(self, key):
        return "{" + key + "}"


def render_message(body: str, occurrence, member) -> str:
    return body.format_map(_SafeDict(
        driver_name=occurrence.driver_name,
        seller_name=occurrence.seller_name,
        dispatcher_name=member.name,
        dispatcher_phone=member.phone,
    ))


def build_whatsapp_url(driver_phone: str, text: str) -> str:
    return f"https://wa.me/{driver_phone}?text={quote(text)}"
