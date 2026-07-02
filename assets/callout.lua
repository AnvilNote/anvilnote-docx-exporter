-- Maps AnvilNote-style callout divs (::: {.callout .note title="..."})
-- to Word paragraph styles defined in reference.docx.
-- Each callout becomes: a bold "title" paragraph (styled CalloutTitle<Kind>)
-- followed by its body paragraphs re-styled to Callout<Kind>.

-- Mirrors anvilnote-web/src/config/callouts.ts's 12 kinds.
local KNOWN_KINDS = {
  note = true,
  abstract = true,
  info = true,
  tip = true,
  success = true,
  question = true,
  warning = true,
  failure = true,
  danger = true,
  bug = true,
  example = true,
  quote = true,
}

function capitalize(s)
  return s:sub(1, 1):upper() .. s:sub(2)
end

function Div(el)
  if not el.classes:includes("callout") then
    return nil
  end

  local kind = "note"
  for _, cls in ipairs(el.classes) do
    if KNOWN_KINDS[cls] then
      kind = cls
    end
  end

  local title = el.attributes["title"]
  local blocks = pandoc.List()

  if title and title ~= "" then
    local title_para = pandoc.Para({ pandoc.Strong({ pandoc.Str(title) }) })
    local title_div = pandoc.Div(
      { title_para },
      pandoc.Attr("", {}, { ["custom-style"] = "CalloutTitle" .. capitalize(kind) })
    )
    blocks:insert(title_div)
  end

  local body_div = pandoc.Div(
    el.content,
    pandoc.Attr("", {}, { ["custom-style"] = "Callout" .. capitalize(kind) })
  )
  blocks:insert(body_div)

  return blocks
end
