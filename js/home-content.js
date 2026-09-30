/* 首页编辑内容：图片、入口、手记和场景文案统一在此替换。真实个体仍由 public-catalog 读取。 */
window.SuohaHomeContent = {
  images: {
    earth: { src: '/assets/photos/hognose-earth-concept-1536.webp', small: '/assets/photos/hognose-earth-concept-768.webp', width: 1536, height: 1024, alt: '砂岩色调中的猪鼻蛇盘身概念图', credit: 'AI 概念视觉 · 非在售个体' },
    closeup: { src: '/assets/photos/hognose-closeup-1536.webp', small: '/assets/photos/hognose-closeup-768.webp', width: 1536, height: 1024, alt: '橙色猪鼻蛇特写，原片经过背景艺术处理', credit: '原片艺术处理 · 状态以档案为准' },
    room: { src: '/assets/photos/breeding-room-1600.webp', small: '/assets/photos/breeding-room-800.webp', smallWidth: 800, width: 1600, height: 1200, alt: 'SUOHA 爬房实拍，窗边的独立饲养盒与饲养架', credit: 'SUOHA 爬房实拍' },
    studio: { src: '/assets/photos/pixel-breeding-studio-1536.webp', small: '/assets/photos/pixel-breeding-studio-768.webp', width: 1536, height: 768, alt: '粗像素爬房：男生穿着橄榄色围裙，走在三组抽屉式爬柜前', credit: '原创 AI 像素小故事 · 非实拍' }
  },
  doors: [
    { image: 'earth', index: '01', kicker: 'FIND YOUR COMPANION', title: '遇见，下一位伙伴。', text: '从真实照片与档案开始，找到想进一步了解的个体。', link: '/collection?status=available', action: '浏览在售个体' },
    { image: 'closeup', index: '02', kicker: 'MEET THE COLLECTION', title: '看见，繁育的方向。', text: '走近留种个体，了解我们正在记录的不同。', link: '/collection?status=display', action: '认识留种个体' }
  ],
  moments: [
    { id: 'observe', label: '观察', time: '01 / TAKE A CLOSER LOOK', title: '停一会儿，看见小变化。', text: '一张照片，一次观察。把注意力留给眼前的个体，也把变化留给下一次回看。', link: '/collection', action: '走近个体档案', x: 77, y: 48 },
    { id: 'record', label: '记录', time: '02 / KEEP A FIELD NOTE', title: '今天的日常，明天的线索。', text: '日期、体重、喂食与蜕皮，各自是一条小记录。放在一起，才能慢慢读懂成长。', note: 'growth', action: '看看怎样读成长记录', x: 64, y: 46 },
    { id: 'breed', label: '繁育', time: '03 / WAIT FOR THE NEXT CHAPTER', title: '为下一段故事，留一页空白。', text: '从计划到实际发生，每一步都有自己的日期。期待新的生命，也认真保留等待的过程。', note: 'archive', action: '了解档案里的信息', x: 40, y: 65 }
  ],
  notes: [
    { id: 'archive', category: '档案入门', en: 'READ THE ARCHIVE', title: '好看的背后，\n还有哪些信息？', description: '从编号、照片到基因标注，读懂一份公开档案。', icon: 'hognose', image: 'earth', intro: '第一眼可以被色彩吸引，进一步了解时，可以把注意力放回这条个体自己的记录。', sections: [
      { title: '先确认是同一条个体', text: '记下档案编号，再对照照片、性别和出生资料。咨询时带上编号，沟通会更清楚；不要用首页概念图判断某条个体的实际表现。' },
      { title: '分开看照片与基因标注', text: '照片展示外观；档案中的表现、确定携带和可能携带是不同的信息。带有概率或尚未确认的标注，请保留它的不确定性。缺少的资料可以询问，不需要自己补全。' },
      { title: '最后看当前状态', text: '在售个体可以提交购买意向；已预留个体可咨询候补。留种展示与已售档案用于了解，不开放购买意向。具体可购买情况仍需沟通确认。' }
    ] },
    { id: 'growth', category: '成长观察', en: 'SMALL NOTES, REAL GROWTH', title: '把一次观察，\n放回成长的时间里。', description: '照片之外，日期与连续记录也值得一起看。', icon: 'record', image: 'room', intro: '一份记录的价值，不只在于某一个数字，也在于它发生的时间，以及前后发生了什么。', sections: [
      { title: '让照片带上日期', text: '不同时间、光线与拍摄角度都可能带来视觉差异。了解个体时，先确认照片大致拍摄时间，需要时再询问近期照片。' },
      { title: '把单次信息放回连续记录', text: '体重、喂食和蜕皮记录可以按日期一起回看。单次记录只描述当时的观察；连续记录也不应代替专业健康判断。公开页只展示已选择公开的内容，其他资料可以在咨询中询问。' },
      { title: '区分计划日期与实际日期', text: '预计交配、产蛋、出壳属于计划；实际发生后才能成为事实记录。阅读繁育资料时，先看清日期对应的是哪一种事件。' }
    ] },
    { id: 'connect', category: '相遇之前', en: 'BEFORE WE CONNECT', title: '喜欢之后，\n先聊清楚这几件事。', description: '带着具体问题沟通，让下一步更从容。', icon: 'care', image: 'closeup', intro: '购买意向是一次沟通的开始。你可以先浏览，再带着真正关心的问题来了解。', sections: [
      { title: '带上编号和你的问题', text: '可以询问近期照片、出生资料、已记录的基因信息、近期喂食情况，以及自己尚不清楚的部分。在个体详情页提交意向，系统会关联对应个体。' },
      { title: '留下便于联系的方式', text: '填写称呼、联系方式和问题。提交后保留意向编号，后续以双方实际沟通为准；表单不会直接扣款。' },
      { title: '确认个体，再确认安排', text: '个体状态、预留和交付细节需要逐项确认。提交意向不代表已经预留成功，页面展示的状态也可能在后续沟通期间发生变化。' }
    ] },
    { id: 'breeding', category: '繁育记录', en: 'FROM A PLAN TO A STORY', title: '从一个计划，\n到一份新生档案。', description: '分清计划、实际记录和个体身份，读懂繁育过程。', icon: 'eggs', image: 'studio', intro: '一次繁育需要留下许多不同的记录。本站把计划和实际发生的事情分开，也为每一条新生个体保留独立身份。', sections: [
      { title: '计划是一种期待', text: '年度计划可以记录亲本、目标和预计日期。预计交配、产蛋和出壳日期用于安排提醒，不会在日期到达时自动变成实际结果。' },
      { title: '每窝都有自己的进度', text: '实际交配、是否成功、产蛋和出壳日期分别记录。同一个计划可以关联多个窝次，各窝按自己的日期更新，不能用第一窝的结果替代全部进度。' },
      { title: '新生个体从自己的档案开始', text: '确认实际孵化数量后，再登记幼体编号、性别、日期和已确认资料。不能把亲本配对的预测概率直接当作幼体的基因结论。留存或公开展示后，仍沿用同一个体身份。' }
    ] }
  ]
};
