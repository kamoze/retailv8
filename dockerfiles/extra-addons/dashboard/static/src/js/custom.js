$(document).ready(function(){
	$(document).on('click', ".oe_form_button_edit", function () {
		$('.input1').iconpicker(".input1");
	});
  
  $('.howl-iconpicker-close').click(function() {
	  $('.input1').select();
	  document.execCommand('copy');
  });
  
  
});

