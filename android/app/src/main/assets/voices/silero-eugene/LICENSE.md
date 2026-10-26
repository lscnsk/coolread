# Голос Silero (eugene)

Модели синтеза речи: Silero Models, https://github.com/snakers4/silero-models
Авторы: Silero Team (Alexander Veysov и др.).

Лицензия: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC BY-NC-SA 4.0), https://creativecommons.org/licenses/by-nc-sa/4.0/

Изменения: модель голоса eugene переведена из формата PyTorch в ONNX и разделена на части
(front.onnx, homo.onnx, back.onnx) для работы на телефоне. Эти файлы распространяются
на тех же условиях: только некоммерческое использование, с указанием авторства.

Ударения и омографы (accentor.bin, homodict.txt, exceptions.txt, ngrams.txt, vocab.txt):
Silero Stress, https://github.com/snakers4/silero-stress, лицензия MIT.
