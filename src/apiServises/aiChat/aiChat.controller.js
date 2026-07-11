import AiChatModel from './aiChat.model.js';

/*
  Controller del chat con la IA (privado por usuario). Todas las operaciones
  se acotan por `owner: req.session.userId`, de modo que un usuario nunca
  puede ver ni tocar las conversaciones de otro (si no es suya → 404).

  Los campos que llegan del body se filtran (whitelisting) para evitar
  mass-assignment, igual que en el recurso `chat`. El `owner` SIEMPRE sale de
  la sesión, jamás del body.
*/

const controller = {};

const MAX_TITLE = 60;
const DEFAULT_TITLE = 'Nueva conversación';
const ALLOWED_ROLES = ['user', 'assistant', 'system'];


// ── Helpers de saneamiento (whitelisting) ──

function sanitizeAttachment(a) {
    if (!a || typeof a !== 'object') return null;
    return {
        name: typeof a.name === 'string' ? a.name : undefined,
        size: typeof a.size === 'number' ? a.size : undefined,
        kind: typeof a.kind === 'string' ? a.kind : undefined,
        mimeType: typeof a.mimeType === 'string' ? a.mimeType : undefined,
        url: typeof a.url === 'string' ? a.url : undefined
    };
}

function sanitizeMessage(m) {
    if (!m || typeof m !== 'object' || !ALLOWED_ROLES.includes(m.role)) return null;

    const message = {
        role: m.role,
        content: typeof m.content === 'string' ? m.content : ''
    };
    if (typeof m.displayContent === 'string') message.displayContent = m.displayContent;
    if (Array.isArray(m.attachments)) {
        message.attachments = m.attachments.map(sanitizeAttachment).filter(Boolean);
    }
    // Imágenes: solo URLs (string). Nunca base64 (empieza por 'data:').
    if (Array.isArray(m.images)) {
        message.images = m.images.filter(u => typeof u === 'string' && !u.startsWith('data:'));
    }
    return message;
}

function makeTitle(messages) {
    const firstUser = (messages || []).find(m => m.role === 'user');
    if (!firstUser) return DEFAULT_TITLE;
    const src = (firstUser.displayContent || firstUser.content || '').trim().replace(/\s+/g, ' ');
    if (!src) return DEFAULT_TITLE;
    return src.length > 40 ? `${src.slice(0, 40)}…` : src;
}


// ── Endpoints ──

// GET  /ai-chat  →  lista de conversaciones del usuario (sin mensajes, ligero)
controller.listConversations = async (req, res) => {
    try {
        const owner = req.session.userId;
        const conversations = await AiChatModel
            .find({ owner })
            .select('title createdAt updatedAt')
            .sort({ updatedAt: -1 });

        return res.status(200).json({ result: conversations, status: 200 });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


// GET  /ai-chat/id=:id  →  una conversación completa (con mensajes)
controller.getConversation = async (req, res) => {
    try {
        const owner = req.session.userId;
        const conversation = await AiChatModel.findOne({ _id: req.params.id, owner });

        if (!conversation) return res.status(404).json({ error: 'Not found', status: 404, message: 'Conversación no encontrada' });
        return res.status(200).json({ result: conversation, status: 200 });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


// POST  /ai-chat  →  crea una conversación (opcionalmente con mensajes/título)
controller.createConversation = async (req, res) => {
    try {
        const owner = req.session.userId;
        const messages = Array.isArray(req.body.messages)
            ? req.body.messages.map(sanitizeMessage).filter(Boolean)
            : [];

        const title = typeof req.body.title === 'string' && req.body.title.trim()
            ? req.body.title.trim().slice(0, MAX_TITLE)
            : makeTitle(messages);

        const conversation = await AiChatModel.create({ owner, title, messages });
        return res.status(200).json({ result: conversation, status: 200, message: 'Conversación creada' });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


// POST  /ai-chat/id=:id/message  →  añade un mensaje a la conversación
controller.appendMessage = async (req, res) => {
    try {
        const owner = req.session.userId;
        const message = sanitizeMessage(req.body);
        if (!message) return res.status(400).json({ error: 'Bad request', status: 400, message: 'Mensaje inválido: se requiere un role válido (user | assistant | system)' });

        const conversation = await AiChatModel.findOne({ _id: req.params.id, owner });
        if (!conversation) return res.status(404).json({ error: 'Not found', status: 404, message: 'Conversación no encontrada' });

        conversation.messages.push(message);
        // Deriva el título del primer mensaje del usuario si aún es el por defecto.
        if (!conversation.title || conversation.title === DEFAULT_TITLE) {
            conversation.title = makeTitle(conversation.messages);
        }
        const saved = await conversation.save();
        const savedMessage = saved.messages[saved.messages.length - 1];

        return res.status(200).json({ result: savedMessage, conversationId: saved._id, title: saved.title, status: 200 });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


// PATCH  /ai-chat/id=:id  →  renombra la conversación
controller.updateTitle = async (req, res) => {
    try {
        const owner = req.session.userId;
        const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, MAX_TITLE) : '';
        if (!title) return res.status(400).json({ error: 'Bad request', status: 400, message: 'El título es requerido' });

        const conversation = await AiChatModel
            .findOneAndUpdate({ _id: req.params.id, owner }, { title }, { new: true })
            .select('title updatedAt');

        if (!conversation) return res.status(404).json({ error: 'Not found', status: 404, message: 'Conversación no encontrada' });
        return res.status(200).json({ result: conversation, status: 200, message: 'Título actualizado' });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


// POST  /ai-chat/id=:id/clear  →  vacía los mensajes (conserva la conversación)
controller.clearConversation = async (req, res) => {
    try {
        const owner = req.session.userId;
        const conversation = await AiChatModel
            .findOneAndUpdate({ _id: req.params.id, owner }, { messages: [] }, { new: true })
            .select('title updatedAt');

        if (!conversation) return res.status(404).json({ error: 'Not found', status: 404, message: 'Conversación no encontrada' });
        return res.status(200).json({ result: conversation, status: 200, message: 'Conversación vaciada' });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


// DELETE  /ai-chat/id=:id  →  elimina la conversación
controller.deleteConversation = async (req, res) => {
    try {
        const owner = req.session.userId;
        const deleted = await AiChatModel.findOneAndDelete({ _id: req.params.id, owner });

        if (!deleted) return res.status(404).json({ error: 'Not found', status: 404, message: 'Conversación no encontrada' });
        return res.status(200).json({ result: { id: deleted._id }, status: 200, message: 'Conversación eliminada' });
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ error: 'Server internal', status: 500, message: error.message });
    }
};


export default controller;
